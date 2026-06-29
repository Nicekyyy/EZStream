const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const apiDistDir = path.join(projectRoot, 'apps/desktop/api-dist');

console.log(`Project root: ${projectRoot}`);
console.log(`API dist target: ${apiDistDir}`);

// Clean existing api-dist
if (fs.existsSync(apiDistDir)) {
  console.log('Cleaning existing api-dist...');
  fs.rmSync(apiDistDir, { recursive: true, force: true });
}

fs.mkdirSync(apiDistDir, { recursive: true });

function copy(srcRel, destRel) {
  const src = path.join(projectRoot, srcRel);
  const dest = path.join(apiDistDir, destRel);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: source does not exist: ${srcRel}`);
    return;
  }
  console.log(`Copying ${srcRel} -> ${destRel}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyPackageJson(srcRel, destRel) {
  const src = path.join(projectRoot, srcRel);
  const dest = path.join(apiDistDir, destRel);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: source does not exist: ${srcRel}`);
    return;
  }
  console.log(`Copying and rewriting ${srcRel} -> ${destRel}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  
  const content = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (content.main && content.main.includes('./src/')) {
    content.main = content.main.replace('./src/', './dist/').replace('.ts', '.js');
  }
  if (content.types && content.types.includes('./src/')) {
    content.types = content.types.replace('./src/', './dist/').replace('.ts', '.js');
  }
  if (content.exports) {
    if (typeof content.exports === 'string' && content.exports.includes('./src/')) {
      content.exports = content.exports.replace('./src/', './dist/').replace('.ts', '.js');
    } else if (typeof content.exports === 'object') {
      for (const key in content.exports) {
        if (typeof content.exports[key] === 'string' && content.exports[key].includes('./src/')) {
          content.exports[key] = content.exports[key].replace('./src/', './dist/').replace('.ts', '.js');
        }
      }
    }
  }
  fs.writeFileSync(dest, JSON.stringify(content, null, 2), 'utf8');
}

// Copy configuration files
copy('package.json', 'package.json');
copy('pnpm-workspace.yaml', 'pnpm-workspace.yaml');

// Copy workspaces packages
copy('apps/api/package.json', 'apps/api/package.json');
copy('apps/api/dist', 'apps/api/dist');

copy('apps/web/out', 'apps/web/out');

copyPackageJson('packages/db/package.json', 'packages/db/package.json');
copy('packages/db/prisma', 'packages/db/prisma');
copy('packages/db/dist', 'packages/db/dist');

copyPackageJson('packages/shared/package.json', 'packages/shared/package.json');
copy('packages/shared/dist', 'packages/shared/dist');

copyPackageJson('packages/ui/package.json', 'packages/ui/package.json');
copy('packages/ui/dist', 'packages/ui/dist');

// Write .npmrc to use hoisted linker to prevent deep symlink bundling errors in Tauri
fs.writeFileSync(path.join(apiDistDir, '.npmrc'), 'node-linker=hoisted\n');

console.log('Installing production dependencies in api-dist...');
execSync('pnpm install --prod --no-frozen-lockfile', {
  cwd: apiDistDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

console.log('Generating Prisma Client in api-dist...');
execSync('node ../../node_modules/prisma/build/index.js generate', {
  cwd: path.join(apiDistDir, 'packages/db'),
  stdio: 'inherit'
});

console.log('Desktop preparation complete!');
