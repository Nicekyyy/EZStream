import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get()
  getRoot() {
    return {
      service: "ezstream-api",
      phase: 1,
      status: "ok"
    };
  }

  @Get("health")
  getHealth() {
    return {
      status: "ok"
    };
  }
}
