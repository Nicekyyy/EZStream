import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import express, { Request, Response, NextFunction } from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { AppModule } from "./app.module.js";
import { HttpErrorFilter } from "./common/http-error.filter.js";
import { isOriginAllowed } from "./common/cors.js";

// Keep the process alive when a stray promise rejects (e.g. a chat connector
// callback failing mid-stream) — log loudly instead of crashing the overlay.
process.on("unhandledRejection", (reason) => {
  console.error("[api] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[api] Uncaught exception:", error);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(process.env.PORT) || config.get<number>("API_PORT", 4000);

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, isOriginAllowed(origin));
    },
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  app.use("/storage", express.static(resolve(config.get<string>("LOCAL_STORAGE_ROOT", "./storage"))));

  // Serve Next.js static exported assets
  const webStaticRoot = resolve(config.get<string>("WEB_STATIC_ROOT") || resolve(process.cwd(), "../web/out"));
  console.log(`Serving static web assets from: ${webStaticRoot}`);

  app.use((req: Request, res: Response, next: NextFunction) => {
    // 1. Only intercept GET requests for static serving
    if (req.method !== "GET") {
      return next();
    }

    // 2. Skip Storage and Socket.io requests
    if (req.path.startsWith("/storage") || req.path.startsWith("/socket.io")) {
      return next();
    }

    // 3. Skip NestJS API routes
    const apiRoutes = [
      "/overlays",
      "/widgets",
      "/rules",
      "/events",
      "/tts",
      "/chat-sources",
      "/mock-events",
      "/creators",
      "/creator",
      "/users",
      "/audit-logs",
      "/media",
      "/health",
      "/auth",
      "/public"
    ];

    if (apiRoutes.some(route => req.path === route || req.path.startsWith(route + "/"))) {
      return next();
    }

    const cleanPath = req.path.replace(/^\//, "");
    const targetPath = resolve(webStaticRoot, cleanPath);

    // 1. If path is a directory and has index.html, serve it
    if (existsSync(targetPath) && existsSync(resolve(targetPath, "index.html"))) {
      return res.sendFile(resolve(targetPath, "index.html"));
    }

    // 2. Try matching nextjs route `.html` file (e.g. `/dashboard` -> `/dashboard.html`)
    if (cleanPath && existsSync(targetPath + ".html")) {
      return res.sendFile(targetPath + ".html");
    }

    // 3. Fallback to normal express static serving (for js, css, images, etc.)
    return express.static(webStaticRoot)(req, res, (err) => {
      if (err) return next(err);

      // 4. SPA Fallback: if file doesn't exist, serve index.html
      const indexPath = resolve(webStaticRoot, "index.html");
      if (existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      return next();
    });
  });

  await app.listen(port);
  console.log(`EZStream API listening on http://localhost:${port}`);
}

void bootstrap();
