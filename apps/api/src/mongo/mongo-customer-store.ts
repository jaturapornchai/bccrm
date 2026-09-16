import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { MongoService } from "./mongo.service";

export interface CustomerRecord {
  id: string;
  lineUserId: string;
  displayName?: string;
  pictureUrl?: string;
  phone?: string;
  consentAt?: Date;
  consentVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MongoCustomerStore {
  private readonly logger = new Logger(MongoCustomerStore.name);
  private setupOnce: Promise<void> | null = null;

  constructor(private readonly mongo: MongoService) {}

  private async collection(): Promise<Collection<CustomerRecord>> {
    return (await this.mongo.db()).collection<CustomerRecord>("customers");
  }

  private ensureSetup(): Promise<void> {
    this.setupOnce ??= this.setup().catch((err) => {
      this.setupOnce = null;
      throw err;
    });
    return this.setupOnce;
  }

  private async setup(): Promise<void> {
    const col = await this.collection();
    await col.createIndex(
      { lineUserId: 1 },
      { unique: true, name: "uniq_line_user_id" },
    );
  }

  async upsertByLineUserId(
    lineUserId: string,
    data: {
      displayName?: string;
      pictureUrl?: string;
      phone?: string;
      consentAt?: Date;
      consentVersion?: string;
    } = {},
  ): Promise<CustomerRecord> {
    await this.ensureSetup();
    const col = await this.collection();
    const now = new Date();

    const existing = await col.findOne({ lineUserId });
    if (existing) {
      const updatePayload: Partial<CustomerRecord> = {
        updatedAt: now,
      };
      if (data.displayName !== undefined) updatePayload.displayName = data.displayName;
      if (data.pictureUrl !== undefined) updatePayload.pictureUrl = data.pictureUrl;
      if (data.phone !== undefined) updatePayload.phone = data.phone;
      if (data.consentAt !== undefined) updatePayload.consentAt = data.consentAt;
      if (data.consentVersion !== undefined) updatePayload.consentVersion = data.consentVersion;

      const updated = await col.findOneAndUpdate(
        { lineUserId },
        { $set: updatePayload },
        { returnDocument: "after" },
      );
      return updated!;
    }

    const newCustomer: CustomerRecord = {
      id: randomUUID(),
      lineUserId,
      displayName: data.displayName,
      pictureUrl: data.pictureUrl,
      phone: data.phone,
      consentAt: data.consentAt,
      consentVersion: data.consentVersion,
      createdAt: now,
      updatedAt: now,
    };
    await col.insertOne(newCustomer);
    return newCustomer;
  }

  async findByLineUserId(lineUserId: string): Promise<CustomerRecord | null> {
    await this.ensureSetup();
    return (await this.collection()).findOne({ lineUserId });
  }

  async findById(id: string): Promise<CustomerRecord | null> {
    await this.ensureSetup();
    return (await this.collection()).findOne({ id });
  }
}
