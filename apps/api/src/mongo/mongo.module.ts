import { Global, Module } from "@nestjs/common";
import { MongoService } from "./mongo.service";
import { MongoCustomerStore } from "./mongo-customer-store";

@Global()
@Module({
  providers: [MongoService, MongoCustomerStore],
  exports: [MongoService, MongoCustomerStore],
})
export class MongoModule {}
