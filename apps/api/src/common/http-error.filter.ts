import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : "Internal server error";

    if (!(exception instanceof HttpException)) {
      console.error(exception);
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      error: typeof body === "string" ? body : body,
      timestamp: new Date().toISOString()
    });
  }
}
