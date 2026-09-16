import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // เก็บ raw body สำหรับตรวจ LINE signature ที่ webhook
    rawBody: true,
  });

  app.setGlobalPrefix("api", { exclude: ["health", "webhooks/line", "mcp"] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors({ origin: true, credentials: true });

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  console.log(`BCCRM API รันที่ http://localhost:${port}`);
}

bootstrap();
