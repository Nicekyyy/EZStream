use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn clean_path(path: &std::path::Path) -> String {
    let s = path.to_string_lossy().to_string();
    if s.starts_with(r"\\?\") {
        s[4..].to_string()
    } else {
        s
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>> =
        Arc::new(Mutex::new(None));
    let api_child_clone = api_child.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            // #[cfg(not(debug_assertions))] // REMOVED so it runs in dev mode too
            {
                let app_handle = app.handle().clone();
                let api_child_setup = api_child_clone.clone();

                tauri::async_runtime::spawn(async move {
                    // 1. Resolve paths
                    let resource_dir = app_handle
                        .path()
                        .resource_dir()
                        .expect("Failed to get resource dir");
                    let app_data_dir = app_handle
                        .path()
                        .app_local_data_dir()
                        .expect("Failed to get app data dir");

                    // Create app data dir if not exists
                    if !app_data_dir.exists() {
                        std::fs::create_dir_all(&app_data_dir)
                            .expect("Failed to create app local data directory");
                    }

                    let db_file_path = app_data_dir.join("ezstream.db");
                    let storage_dir_path = app_data_dir.join("storage");

                    if !storage_dir_path.exists() {
                        std::fs::create_dir_all(&storage_dir_path)
                            .expect("Failed to create storage directory");
                    }

                    let db_url = format!("file:{}", clean_path(&db_file_path).replace('\\', "/"));
                    let storage_root = clean_path(&storage_dir_path);

                    let api_dist_dir = resource_dir.join("_up_/api-dist");

                    let api_script_path =
                        clean_path(&api_dist_dir.join("apps/api/dist/apps/api/src/main.js"));
                    let prisma_cli_path =
                        clean_path(&api_dist_dir.join("node_modules/prisma/build/index.js"));
                    let schema_path =
                        clean_path(&api_dist_dir.join("packages/db/prisma/schema.prisma"));
                    let web_static_root = clean_path(&api_dist_dir.join("apps/web/out"));

                    let log_path = app_data_dir.join("ezstream.log");
                    let log = |msg: &str| {
                        if let Ok(mut file) = std::fs::OpenOptions::new()
                            .create(true)
                            .append(true)
                            .open(&log_path)
                        {
                            use std::io::Write;
                            let _ = writeln!(file, "{}", msg);
                        }
                    };

                    log("-----------------------------------------");
                    log("EZStream app execution started.");
                    log(&format!("Database URL: {}", db_url));
                    log(&format!("Storage root: {}", storage_root));
                    log(&format!("Web static root: {}", web_static_root));
                    log(&format!("API script path: {}", api_script_path));
                    log(&format!("Prisma CLI path: {}", prisma_cli_path));
                    log(&format!("Schema path: {}", schema_path));

                    let db_existed = db_file_path.exists();

                    // 2. Run Database Migrations
                    log("Running database migrations...");
                    let migration_command = match app_handle.shell().sidecar("node") {
                        Ok(cmd) => cmd
                            .arg(&prisma_cli_path)
                            .arg("db")
                            .arg("push")
                            .arg("--accept-data-loss")
                            .arg("--schema")
                            .arg(&schema_path)
                            .env("DATABASE_URL", &db_url),
                        Err(e) => {
                            log(&format!(
                                "Failed to initialize node sidecar for migration: {:?}",
                                e
                            ));
                            return;
                        }
                    };

                    match migration_command.spawn() {
                        Ok((mut mig_rx, _mig_child)) => {
                            while let Some(event) = mig_rx.recv().await {
                                match event {
                                    CommandEvent::Stdout(line) => {
                                        log(&format!(
                                            "Migration stdout: {}",
                                            String::from_utf8_lossy(&line).trim()
                                        ));
                                    }
                                    CommandEvent::Stderr(line) => {
                                        log(&format!(
                                            "Migration stderr: {}",
                                            String::from_utf8_lossy(&line).trim()
                                        ));
                                    }
                                    _ => {}
                                }
                            }
                            log("Migration process finished.");
                        }
                        Err(e) => {
                            log(&format!("FAILED TO SPAWN MIGRATION SIDECAR: {:?}", e));
                        }
                    }

                    if !db_existed {
                        log("First run detected. Seeding database...");
                        let seed_script_path =
                            clean_path(&api_dist_dir.join("packages/db/dist/prisma/seed.js"));
                        let seed_command = match app_handle.shell().sidecar("node") {
                            Ok(cmd) => cmd.arg(&seed_script_path).env("DATABASE_URL", &db_url),
                            Err(e) => {
                                log(&format!(
                                    "Failed to initialize node sidecar for seed: {:?}",
                                    e
                                ));
                                return;
                            }
                        };

                        match seed_command.spawn() {
                            Ok((mut seed_rx, _seed_child)) => {
                                while let Some(event) = seed_rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            log(&format!(
                                                "Seed stdout: {}",
                                                String::from_utf8_lossy(&line).trim()
                                            ));
                                        }
                                        CommandEvent::Stderr(line) => {
                                            log(&format!(
                                                "Seed stderr: {}",
                                                String::from_utf8_lossy(&line).trim()
                                            ));
                                        }
                                        _ => {}
                                    }
                                }
                                log("Seed process finished.");
                            }
                            Err(e) => {
                                log(&format!("FAILED TO SPAWN SEED SIDECAR: {:?}", e));
                            }
                        }
                    }

                    // 3. Start NestJS API Server
                    log("Starting NestJS API sidecar...");
                    let api_command = match app_handle.shell().sidecar("node") {
                        Ok(cmd) => cmd
                            .arg(&api_script_path)
                            .env("DATABASE_URL", &db_url)
                            .env("LOCAL_STORAGE_ROOT", &storage_root)
                            .env("PORT", "4000")
                            .env("API_PORT", "4000")
                            .env("WEB_STATIC_ROOT", &web_static_root)
                            .env("API_CORS_ORIGIN", "http://localhost:3000")
                            .env("JWT_SECRET", "default-tauri-jwt-secret-key-123")
                            .env("NODE_ENV", "production"),
                        Err(e) => {
                            log(&format!(
                                "Failed to initialize node sidecar for NestJS API: {:?}",
                                e
                            ));
                            return;
                        }
                    };

                    match api_command.spawn() {
                        Ok((mut api_rx, child)) => {
                            // Keep child process handle in shared state
                            *api_child_setup.lock().unwrap() = Some(child);

                            log("NestJS API spawned successfully. Listening for output...");
                            while let Some(event) = api_rx.recv().await {
                                match event {
                                    CommandEvent::Stdout(line) => {
                                        log(&format!(
                                            "API stdout: {}",
                                            String::from_utf8_lossy(&line).trim()
                                        ));
                                    }
                                    CommandEvent::Stderr(line) => {
                                        log(&format!(
                                            "API stderr: {}",
                                            String::from_utf8_lossy(&line).trim()
                                        ));
                                    }
                                    _ => {}
                                }
                            }
                            log("API process terminated.");
                        }
                        Err(e) => {
                            log(&format!("FAILED TO SPAWN NestJS API SIDECAR: {:?}", e));
                        }
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let api_child_exit = api_child.clone();
    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            println!("App exiting, terminating API sidecar...");
            if let Ok(mut guard) = api_child_exit.lock() {
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
