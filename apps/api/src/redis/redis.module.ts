import { Global, Module } from "@nestjs/common";
import { EventEmitter } from "node:events";

export const REDIS = Symbol("REDIS");

class MockRedis extends EventEmitter {
  private static globalBus = new EventEmitter();

  constructor() {
    super();
    MockRedis.globalBus.setMaxListeners(100);
    this.setMaxListeners(100);
  }

  duplicate() {
    return new MockRedis();
  }

  async publish(channel: string, message: string): Promise<number> {
    MockRedis.globalBus.emit(channel, message);
    return 1;
  }

  async subscribe(channel: string): Promise<void> {
    MockRedis.globalBus.on(channel, (message: string) => {
      this.emit("message", channel, message);
    });
  }

  async quit(): Promise<string> {
    return "OK";
  }

  async disconnect(): Promise<void> {}
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        return new MockRedis();
      }
    }
  ],
  exports: [REDIS]
})
export class RedisModule {}
