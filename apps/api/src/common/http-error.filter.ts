import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const isHttpException = exception instanceof HttpException || (exception && typeof (exception as any).getStatus === "function");
    const status = isHttpException ? (exception as any).getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? (exception as any).getResponse() : "Internal server error";

    if (!isHttpException) {
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
