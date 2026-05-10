import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import express from "express";
import { resolve } from "node:path";
import { AppModule } from "./app.module.js";
import { HttpErrorFilter } from "./common/http-error.filter.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(process.env.PORT) || config.get<number>("API_PORT", 4000);

  app.enableCors({
    origin: config.get<string>("API_CORS_ORIGIN", "http://localhost:3000"),
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

  await app.listen(port);
  console.log(`EZStream API listening on http://localhost:${port}`);
}

void bootstrap();
