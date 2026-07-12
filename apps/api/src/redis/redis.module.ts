import { Global, Module } from "@nestjs/common";
import { EventEmitter } from "node:events";

export const REDIS = Symbol("REDIS");

class MockRedis extends EventEmitter {
  private static globalBus = new EventEmitter();
  private subscriptions = new Map<string, (message: string) => void>();

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
    if (this.subscriptions.has(channel)) return;
    const handler = (message: string) => {
      this.emit("message", channel, message);
    };
    this.subscriptions.set(channel, handler);
    MockRedis.globalBus.on(channel, handler);
  }

  private removeSubscriptions() {
    for (const [channel, handler] of this.subscriptions) {
      MockRedis.globalBus.off(channel, handler);
    }
    this.subscriptions.clear();
  }

  async quit(): Promise<string> {
    this.removeSubscriptions();
    return "OK";
  }

  async disconnect(): Promise<void> {
    this.removeSubscriptions();
  }
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
