import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateTicketDto {
  @IsString()
  branchId!: string;

  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  counterId?: string;

  @IsEnum(["LINE_BOOKING", "WALK_IN_KIOSK", "STAFF_CREATED"] as const)
  source!: "LINE_BOOKING" | "WALK_IN_KIOSK" | "STAFF_CREATED";

  @IsOptional()
  @IsBoolean()
  isVip?: boolean;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  lineUserId?: string;
}

export class CallNextDto {
  @IsString()
  branchId!: string;

  @IsString()
  counterId!: string;

  @IsString()
  staffId!: string;
}

export class ListQueueQuery {
  @IsString()
  branchId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}
