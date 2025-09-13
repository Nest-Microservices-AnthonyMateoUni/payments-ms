import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config';

async function bootstrap() {
  const logger = new Logger();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  await app.listen(envs.port);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  logger.log(`Payments Microservice Running on port ${envs.port}`);
}
bootstrap();
