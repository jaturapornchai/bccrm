import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class OrderItemDto {
  @IsString()
  itemId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  price!: number;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsString()
  spiciness?: string; // "non-spicy" | "mild" | "normal" | "extra-spicy"

  @IsOptional()
  @IsString()
  sauce?: string; // "spicy" | "soy-garlic" | "snow-onion" | "original"

  @IsOptional()
  @IsString()
  sweetness?: string; // "normal" | "less-sweet"


  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  tableNumber?: string;

  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  lineUserId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RecommendNextDto {
  @IsArray()
  @ArrayMaxSize(50)
  cartItems!: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
    spiciness?: string;
  }>;

  @IsOptional()
  @IsString()
  lastViewedItemId?: string;

  @IsOptional()
  @IsString()
  customerPreference?: string;

  /** ประเภทโต๊ะจากบัตรคิว เช่น "โต๊ะ 3-4 ท่าน" / "สั่งกลับบ้าน" — ใช้บอก JEV ว่ามากี่คน */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tableType?: string;
}
