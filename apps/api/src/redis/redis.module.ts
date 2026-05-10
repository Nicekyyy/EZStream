import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

export const REDIS = Symbol("REDIS");

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis(config.get<string>("REDIS_URL", "redis://localhost:56379"), {
          maxRetriesPerRequest: null
        });
      }
    }
  ],
  exports: [REDIS]
})
export class RedisModule {}
