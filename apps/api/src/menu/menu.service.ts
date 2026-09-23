import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { MongoService } from "../mongo/mongo.service";
import { QueueGateway } from "../realtime/queue.gateway";
import { CreateOrderDto, OrderStatus, RecommendNextDto } from "./dto/menu.dto";
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export interface MenuItem {
  id: string;
  name: string;
  category: "chicken" | "korean_dish" | "snack" | "bingsu" | "drink" | "combo";
  categoryName: string;
  price: number;
  description: string;
  spiceLevel?: number; // 0=none, 1=mild, 2=normal, 3=extra-spicy
  hasSauceOption?: boolean; // For Korean Fried Chicken
  hasSweetnessOption?: boolean; // For Bingsu & Drinks
  isSignature?: boolean;
  isBestSeller?: boolean;
  emoji: string;
  tags: string[];
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  branchId: string;
  tableNumber?: string;
  ticketId?: string;
  lineUserId?: string;
  customerName?: string;
  phone?: string;
  items: Array<{
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    spiciness?: string;
    sauce?: string;
    sweetness?: string;
    note?: string;
    subtotal: number;
  }>;
  totalAmount: number;
  status: "PENDING" | "COOKING" | "READY" | "SERVED" | "CANCELLED";
  note?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const DEFAULT_MENU: MenuItem[] = [
  // 🍗 ไก่ทอดเกาหลีโซมายด์ (Signature Korean Fried Chicken)
  {
    id: "dish-chick-spicy",
    name: "ไก่ทอดซอสเกาหลีสูตรเผ็ดหวาน (5 ชิ้น)",
    category: "chicken",
    categoryName: "ไก่ทอดเกาหลี",
    price: 129,
    description: "ไก่ทอดกรอบนอกนุ่มฉ่ำ คลุกเคล้าซอสเกาหลีสูตรเด็ดรสเผ็ดหวานกลมกล่อม โรยงาขาวคั่ว เสิร์ฟพร้อมหัวไชเท้าดอง",
    spiceLevel: 2,
    isSignature: true,
    isBestSeller: true,
    emoji: "🍗",
    tags: ["ไก่ทอดเกาหลี", "ซอสแดง", "เผ็ดหวาน"],
  },
  {
    id: "dish-chick-garlic",
    name: "ไก่ทอดซอสการ์ลิคซอยเคี่ยวหวานเค็ม (5 ชิ้น)",
    category: "chicken",
    categoryName: "ไก่ทอดเกาหลี",
    price: 129,
    description: "ซอสซีอิ๊วเกาหลีเคี่ยวผสมกระเทียมสด หอมกรุ่น รสหวานเค็มละมุน กรอบฟินทุกคำ",
    spiceLevel: 0,
    isBestSeller: true,
    emoji: "🧄",
    tags: ["ซอสกระเทียม", "หวานเค็ม", "กรอบนอกนุ่มใน"],
  },
  {
    id: "dish-chick-snow-onion",
    name: "ไก่ทอดซอสสโนว์ออเนียนครีมหัวหอม (5 ชิ้น)",
    category: "chicken",
    categoryName: "ไก่ทอดเกาหลี",
    price: 149,
    description: "ไก่ทอดท็อปด้วยหัวหอมใหญ่สไลซ์บางกรุบกรอบ ราดไวท์ซอสครีมสลัดหัวหอมโฮมเมดสูตรเฉพาะของโซมายด์",
    spiceLevel: 0,
    isSignature: true,
    emoji: "🧅",
    tags: ["สโนว์ออเนียน", "ครีมสลัด", "หัวหอมสด"],
  },
  {
    id: "dish-chick-cheese-lava",
    name: "ไก่ทอดคลุกผงชีสพรีเมียมราดชีสลาวา (5 ชิ้น)",
    category: "chicken",
    categoryName: "ไก่ทอดเกาหลี",
    price: 149,
    description: "คลุกผงชีสนำเข้าเข้มข้น ราดชีสซอสลาวาร้อนๆ เยิ้มๆ คนรักชีสต้องกรี๊ด",
    spiceLevel: 0,
    isBestSeller: true,
    emoji: "🧀",
    tags: ["ชีสเยิ้ม", "ผงชีส", "เข้มข้น"],
  },
  {
    id: "dish-chick-original",
    name: "ไก่ทอดออริจินัลกรอบกรุบสูตรโซมายด์ (5 ชิ้น)",
    category: "chicken",
    categoryName: "ไก่ทอดเกาหลี",
    price: 119,
    description: "หมักเครื่องเทศเกาหลีแท้ แป้งบางกรอบไม่อมน้ำมัน เนื้อในชุ่มฉ่ำ เสิร์ฟพร้อมซอสจิ้ม",
    spiceLevel: 0,
    emoji: "🍗",
    tags: ["แป้งบางกรอบ", "ไม่อมน้ำมัน", "สูตรต้นตำรับ"],
  },
  {
    id: "dish-chick-mixed-10",
    name: "ไก่ทอดปาร์ตี้รวมรส 2 ซอส (10 ชิ้น)",
    category: "chicken",
    categoryName: "ไก่ทอดเกาหลี",
    price: 239,
    description: "อิ่มคุ้มยกแก๊ง ไก่ทอด 10 ชิ้นชิ้นโต เลือกผสม 2 ซอสได้ตามใจชอบ (ซอสเกาหลี / การ์ลิค / สโนว์)",
    spiceLevel: 1,
    hasSauceOption: true,
    isSignature: true,
    emoji: "🍗",
    tags: ["10 ชิ้น", "เลือกได้ 2 ซอส", "สุดคุ้ม"],
  },

  // 🍲 อาหารเกาหลีจานหลัก (Korean Main Dishes)
  {
    id: "dish-bibimbap-pork",
    name: "ข้าวยำเกาหลีบิบิมบัมหมูผัดซอส",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 149,
    description: "ข้าวสวยเกาหลีร้อนๆ โปะด้วยหมูผัดซอส ผัก 5 สี ซูกินี เห็ดหอม กิมจิ และไข่แดง ราดซอสโคชูจังสูตรโซมายด์ คลุกเคล้าก่อนทาน",
    spiceLevel: 1,
    isSignature: true,
    isBestSeller: true,
    emoji: "🍲",
    tags: ["ข้าวยำเกาหลี", "โคชูจัง", "ผักรวม"],
  },
  {
    id: "dish-kimchi-fried-rice",
    name: "ข้าวผัดกิมจิหมูสามชั้นไข่ดาวเยิ้ม",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 129,
    description: "กิมจิโฮมเมดผัดกับหมูสามชั้นและข้าวเกาหลี หอมน้ำมันงาแท้ โปะไข่ดาวเยิ้มๆ และสาหร่ายกรอบ",
    spiceLevel: 1,
    isBestSeller: true,
    emoji: "🍳",
    tags: ["กิมจิโฮมเมด", "ไข่ดาวเยิ้ม", "หมูสามชั้น"],
  },
  {
    id: "dish-tteok-cheese",
    name: "ต๊อกบกกีชีสลาวาเหนียวนุ่ม",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 139,
    description: "แป้งต๊อกและโอเด้งปลาเกาหลีในซอสพริกแดงเข้มข้น โปะมอสซาเรลล่าชีสยืดสะใจ ละมุนลิ้น",
    spiceLevel: 2,
    isSignature: true,
    isBestSeller: true,
    emoji: "🥘",
    tags: ["ต๊อกบกกี", "ชีสยืด", "โอเด้ง"],
  },
  {
    id: "dish-rabokki",
    name: "ราพ็อกกีชีสหม้อไฟชามโต (รามยอน+ต๊อก)",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 159,
    description: "รามยอนเส้นเหนียวนุ่ม ผสมแป้งต๊อกบกกี โอเด้ง และไข่ต้ม ในซอสเกาหลีเข้มข้น โปะชีสเยิ้ม",
    spiceLevel: 2,
    isBestSeller: true,
    emoji: "🍜",
    tags: ["รามยอน", "ต๊อกบกกี", "ชีส"],
  },
  {
    id: "dish-jukkumi",
    name: "จูกุมิปลาหมึกสายผัดเผ็ดกระทะร้อน",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 199,
    description: "ปลาหมึกสายตัวแน่นสดกรอบ ผัดซอสเผ็ดเกาหลีสูตรเข้มข้นบนกระทะร้อน เสิร์ฟพร้อมผักสดและสาหร่าย",
    spiceLevel: 3,
    isSignature: true,
    emoji: "🐙",
    tags: ["หมึกสาย", "กระทะร้อน", "เผ็ดจัดจ้าน"],
  },
  {
    id: "dish-budae-jjigae",
    name: "หม้อไฟบูเดชิเกะเกาหลีทรงเครื่อง",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 329,
    description: "หม้อไฟเกาหลีสุดอลังการ ใส่รามยอน ไส้กรอก แฮม ต๊อกบกกี กิมจิ เต้าหู้อ่อน และชีสแผ่น ซดร้อนๆ ฟินทั้งโต๊ะ",
    spiceLevel: 2,
    isSignature: true,
    isBestSeller: true,
    emoji: "🍲",
    tags: ["หม้อไฟเกาหลี", "รามยอน", "ไส้กรอกแฮม"],
  },
  {
    id: "dish-kimchi-soup",
    name: "ซุปกิมจิหมูสามชั้นเต้าหู้อ่อน + ข้าวสวยเกาหลี",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 149,
    description: "ซุปกิมจิรสเข้มข้นเคี่ยวนาน หมูสามชั้นนุ่มละลาย เต้าหู้อ่อน ซดร้อนๆ คล่องคอ เสิร์ฟพร้อมข้าวสวยเกาหลี",
    spiceLevel: 2,
    isBestSeller: true,
    emoji: "🥣",
    tags: ["ซุปกิมจิ", "เต้าหู้อ่อน", "ซดร้อนๆ"],
  },
  {
    id: "dish-bulgogi-rice",
    name: "ข้าวหน้าหมูผัดซอสบูลโกกิกระทะร้อน",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 139,
    description: "เนื้อหมูสไลซ์หมักซอสบูลโกกิหวานเค็มกลมกล่อม ผัดหัวหอมและงาขาว เสิร์ฟบนข้าวสวยเกาหลีร้อนๆ",
    spiceLevel: 0,
    emoji: "🥩",
    tags: ["บูลโกกิ", "หวานเค็ม", "นุ่มละมุน"],
  },
  {
    id: "dish-japchae",
    name: "จับเชผัดวุ้นเส้นเกาหลีน้ำมันงาหอม",
    category: "korean_dish",
    categoryName: "อาหารเกาหลีจานหลัก",
    price: 129,
    description: "วุ้นเส้นเกาหลีเส้นแบนเหนียวนุ่ม ผัดกับผักรวม แครอท เห็ดหอม และหมู คลุกน้ำมันงาแท้หอมฟุ้ง",
    spiceLevel: 0,
    emoji: "🥗",
    tags: ["วุ้นเส้นเกาหลี", "น้ำมันงาแท้", "ทานง่าย"],
  },

  // 🥢 ของทานเล่น & เครื่องเคียง (Snacks & Sides)
  {
    id: "dish-gimmari",
    name: "คิมมารีสาหร่ายห่อวุ้นเส้นทอดกรอบ",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 79,
    description: "สาหร่ายห่อวุ้นเส้นเกาหลีปรุงรสน้ำมันงา ชุบแป้งทอดกรอบสีทอง จิ้มน้ำต๊อกบกกีอร่อยเข้ากันที่สุด",
    spiceLevel: 0,
    isBestSeller: true,
    emoji: "🥢",
    tags: ["คิมมารี", "จิ้มซอสต๊อก", "กรุบกรอบ"],
  },
  {
    id: "dish-cheese-fries",
    name: "เฟรนช์ฟรายส์ชีสลาวาเข้มข้น",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 89,
    description: "มันฝรั่งทอดกรอบสีทองเส้นหนา ราดด้วยชีสซอสสูตรเด็ดเยิ้มๆ ทานเพลินหยุดไม่อยู่",
    spiceLevel: 0,
    emoji: "🍟",
    tags: ["เฟรนช์ฟรายส์", "ชีส", "ทานเพลิน"],
  },
  {
    id: "dish-bacon-fries",
    name: "เบคอนชีสฟรายส์กระทะร้อน",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 99,
    description: "เฟรนช์ฟรายส์กรอบๆ โปะเบคอนกรอบชิ้นหนาและชีสยืด เมนูของว่างยอดฮิตอันดับ 1 ของโซมายด์",
    spiceLevel: 0,
    isSignature: true,
    isBestSeller: true,
    emoji: "🥓",
    tags: ["เบคอนกรอบ", "ชีสเยิ้ม", "ยอดฮิต"],
  },
  {
    id: "dish-mandu",
    name: "มันดูเกี๊ยวซ่าเกาหลีทอดกรอบ",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 89,
    description: "เกี๊ยวซ่าสไตล์เกาหลี ไส้หมูสับและกุยช่าย ทอดจนแป้งกรอบสีทอง เสิร์ฟพร้อมซอสเปรี้ยวหวาน",
    spiceLevel: 0,
    emoji: "🥟",
    tags: ["เกี๊ยวซ่าเกาหลี", "ไส้หมูกุยช่าย", "กรอบนอกนุ่มใน"],
  },
  {
    id: "dish-pickled-radish",
    name: "หัวไชเท้าดองหวานเกาหลีสูตรโซมายด์",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 29,
    description: "หัวไชเท้าดองหั่นเต๋าสูตรเกาหลีแท้ กรอบ หวานอมเปรี้ยว สดชื่น ตัดเลี่ยนไก่ทอดได้สมบูรณ์แบบ",
    spiceLevel: 0,
    emoji: "🥒",
    tags: ["หัวไชเท้าดอง", "ตัดเลี่ยน", "กรอบหวาน"],
  },
  {
    id: "dish-kimchi-side",
    name: "กิมจิผักกาดขาวโฮมเมดโซมายด์",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 39,
    description: "กิมจิผักกาดขาวหมักสดใหม่ รสชาติเปรี้ยวเค็มเผ็ดกลมกล่อม กรอบอร่อย สดชื่น",
    spiceLevel: 1,
    emoji: "🥬",
    tags: ["กิมจิสด", "เปรี้ยวกำลังดี", "กรอบอร่อย"],
  },
  {
    id: "dish-korean-rice",
    name: "ข้าวสวยเกาหลีเม็ดนุ่มหนึบ",
    category: "snack",
    categoryName: "ของทานเล่น",
    price: 25,
    description: "ข้าวสวยเมล็ดสั้นเกาหลีแท้ หุงร้อนๆ เหนียวนุ่มหนึบ ทานคู่กับเมนูไหนก็อร่อย",
    spiceLevel: 0,
    emoji: "🍚",
    tags: ["ข้าวเกาหลี", "นุ่มหนึบ"],
  },

  // 🍧 บิงซูซิกเนเจอร์ (Signature Korean Bingsu — เมนูดังเชียงใหม่)
  {
    id: "dish-bingsu-strawberry",
    name: "บิงซูสตรอว์เบอร์รี่สดครีมชีสเค้ก (Signature อันดับ 1)",
    category: "bingsu",
    categoryName: "บิงซูซิกเนเจอร์",
    price: 199,
    description: "เมนูดังระดับตำนานของโซมายด์ น้ำแข็งใสนมสดปุยหิมะเนียนนุ่ม โปะสตรอว์เบอร์รี่สดลูกโต ชิ้นชีสเค้กนุ่มละลาย และไอศกรีมวานิลลา ราดซอสสตรอว์เบอร์รี่โฮมเมด",
    hasSweetnessOption: true,
    isSignature: true,
    isBestSeller: true,
    emoji: "🍓",
    tags: ["สตรอว์เบอร์รี่สด", "ชีสเค้ก", "ปุยหิมะนมสด"],
  },
  {
    id: "dish-bingsu-mango",
    name: "บิงซูมะม่วงน้ำดอกไม้เสาวรสสดชื่น",
    category: "bingsu",
    categoryName: "บิงซูซิกเนเจอร์",
    price: 189,
    description: "มะม่วงน้ำดอกไม้สุกหวานฉ่ำหั่นเต๋าพูนชาม ตัดรสเปรี้ยวอมหวานด้วยซอสเสาวรสสดชื่น บิงซูนมสดละมุนลิ้น",
    hasSweetnessOption: true,
    isSignature: true,
    emoji: "🥭",
    tags: ["มะม่วงหวานฉ่ำ", "เสาวรสสด", "ตัดเลี่ยน"],
  },
  {
    id: "dish-bingsu-milo",
    name: "บิงซูไมโลภูเขาไฟช็อกโกแลตลาวา",
    category: "bingsu",
    categoryName: "บิงซูซิกเนเจอร์",
    price: 159,
    description: "น้ำแข็งใสนมไมโลเข้มข้น โรยผงไมโลพูนๆ ช็อกโกบอลกรุบกรอบ และราดนมข้นหวานเยิ้มๆ จานโปรดของทุกคน",
    hasSweetnessOption: true,
    isBestSeller: true,
    emoji: "🍫",
    tags: ["ไมโลเข้มข้น", "ช็อกโกบอล", "หวานมัน"],
  },
  {
    id: "dish-bingsu-matcha",
    name: "บิงซูมัทฉะแท้ถั่วแดงโมจิญี่ปุ่น",
    category: "bingsu",
    categoryName: "บิงซูซิกเนเจอร์",
    price: 179,
    description: "ผงมัทฉะเกรดพรีเมียมเข้มข้น โปะถั่วแดงกวนหวานน้อยและโมจิญี่ปุ่นเคี้ยวหนึบหนับ หอมกลิ่นชาเขียวแท้",
    hasSweetnessOption: true,
    emoji: "🍵",
    tags: ["มัทฉะแท้", "โมจินุ่มหนึบ", "ถั่วแดงกวน"],
  },
  {
    id: "dish-bingsu-bualoy",
    name: "บิงซูบัวลอยอัญชันมะพร้าวอ่อนกะทิหอม",
    category: "bingsu",
    categoryName: "บิงซูซิกเนเจอร์",
    price: 169,
    description: "บิงซูนมสดผสานขนมหวานไทย เม็ดบัวลอยนุ่มหนึบ เนื้อมะพร้าวอ่อน และกะทิสดอบควันเทียน ละมุนแปลกใหม่ไม่ซ้ำใคร",
    hasSweetnessOption: true,
    isSignature: true,
    emoji: "🥥",
    tags: ["บัวลอยโฮมเมด", "มะพร้าวอ่อน", "ฟิวชั่นเกาหลีไทย"],
  },

  // 🧋 เครื่องดื่ม & สลัชชี่ (Drinks & Slushy)
  {
    id: "dish-drink-tea-slushy",
    name: "สลัชชี่ชาไทยนมสดเกล็ดหิมะเนียนนุ่ม",
    category: "drink",
    categoryName: "เครื่องดื่ม & สลัชชี่",
    price: 69,
    description: "ชาไทยแท้ปั่นเกล็ดหิมะเนื้อเนียนละเอียด เข้มข้น หวานมันกำลังดี ดับร้อนและตัดเลี่ยนอาหารเกาหลีได้ดีที่สุด",
    hasSweetnessOption: true,
    isSignature: true,
    isBestSeller: true,
    emoji: "🧋",
    tags: ["สลัชชี่", "ชาไทยเข้มข้น", "เกล็ดหิมะ"],
  },
  {
    id: "dish-drink-yuzu",
    name: "สลัชชี่ส้มยูซุโซดาเกาหลีสดชื่น",
    category: "drink",
    categoryName: "เครื่องดื่ม & สลัชชี่",
    price: 69,
    description: "ส้มยูซุนำเข้าจากเกาหลี ปั่นเกล็ดหิมะผสมโซดาซ่า หอมสดชื่น ตื่นเต็มตาทันที",
    hasSweetnessOption: true,
    isBestSeller: true,
    emoji: "🍊",
    tags: ["ยูซุเกาหลี", "โซดาซ่า", "ดับกระหาย"],
  },
  {
    id: "dish-drink-banana-milk",
    name: "นมกล้วยเกาหลีโซมายด์ละมุนลิ้น",
    category: "drink",
    categoryName: "เครื่องดื่ม & สลัชชี่",
    price: 59,
    description: "นมกล้วยสูตรลับสไตล์คาเฟ่เกาหลี หอมหวานละมุนลิ้น เด็กทานได้ผู้ใหญ่ทานดี",
    hasSweetnessOption: true,
    emoji: "🍌",
    tags: ["นมกล้วย", "คาเฟ่เกาหลี", "หวานละมุน"],
  },
  {
    id: "dish-drink-peach-soda",
    name: "ชาพีชเลมอนโซดาคลายร้อน",
    category: "drink",
    categoryName: "เครื่องดื่ม & สลัชชี่",
    price: 59,
    description: "ชาพีชกลิ่นหอมละมุน ผสานความเปรี้ยวซ่าของเลมอนสดและโซดา ซ่าเย็นชื่นใจ",
    hasSweetnessOption: true,
    emoji: "🍑",
    tags: ["ชาพีช", "เลมอน", "สดชื่น"],
  },

  // 🍱 เซ็ตสุดคุ้มโซมายด์ (Value Combos)
  {
    id: "dish-combo-duo",
    name: "ชุดโซมายด์ดูโอ้ (สำหรับ 2 ท่าน)",
    category: "combo",
    categoryName: "เซ็ตสุดคุ้ม",
    price: 319,
    description: "รวมจานเด็ด: ไก่ทอดเกาหลี 5 ชิ้น (เลือกซอสได้) + ต๊อกบกกีชีสลาวา + คิมมารีทอดกรอบ + เครื่องดื่ม 2 แก้ว (ปกติ 376.-)",
    spiceLevel: 1,
    isSignature: true,
    isBestSeller: true,
    emoji: "🍱",
    tags: ["สำหรับ 2 ท่าน", "ไก่ทอด+ต๊อก+คิมมารี", "สุดคุ้ม"],
  },
  {
    id: "dish-combo-party",
    name: "ชุดโซมายด์ปาร์ตี้บิงซู (สำหรับ 3-4 ท่าน)",
    category: "combo",
    categoryName: "เซ็ตสุดคุ้ม",
    price: 699,
    description: "ปาร์ตี้เกาหลีครบครัน: หม้อไฟบูเดชิเกะ + ไก่ทอดเกาหลี 10 ชิ้น + ข้าวผัดกิมจิไข่ดาว + บิงซูสตรอว์เบอร์รี่สดชีสเค้ก + สลัชชี่ 2 แก้ว (ปกติ 886.-)",
    spiceLevel: 2,
    isSignature: true,
    emoji: "🎉",
    tags: ["สำหรับ 3-4 ท่าน", "หม้อไฟ+ไก่ทอด+บิงซู", "ครบเครื่อง"],
  },
];

const FALLBACK_CATEGORY_ORDER: MenuItem["category"][] = ["drink", "bingsu", "snack", "chicken", "korean_dish", "combo"];

const UPSELL_REASON: Record<MenuItem["category"], string> = {
  chicken: "🍗 ไก่ทอดเกาหลีกรอบๆ ทานคู่กันได้ทั้งโต๊ะ",
  korean_dish: "🍲 เพิ่มจานหลักให้อิ่มครบมื้อ",
  snack: "🥢 ของทานเล่นกรอบๆ จิ้มซอสเพลิน",
  bingsu: "🍧 ปิดท้ายด้วยบิงซูซิกเนเจอร์",
  drink: "🧋 เครื่องดื่มเย็นๆ ตัดเลี่ยน ดับเผ็ด",
  combo: "🎉 เซ็ตสุดคุ้ม ประหยัดกว่าสั่งแยก",
};

/** เลือก n รายการตามอันดับ โดยไม่ซ้ำหมวดก่อน (ได้ครบมื้อ เช่น เครื่องดื่ม+ของหวาน+ของทานเล่น) แล้วค่อยเติมที่เหลือ */
export function pickDiverse<T extends { dish: MenuItem }>(ranked: T[], n: number): T[] {
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const r of ranked) {
    if (picked.length < n && !seen.has(r.dish.category)) {
      picked.push(r);
      seen.add(r.dish.category);
    }
  }
  for (const r of ranked) if (picked.length < n && !picked.includes(r)) picked.push(r);
  return picked;
}

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);
  private jevClient: TypeSafeClient | null = null;
  private setupOnce: Promise<void> | null = null;

  constructor(
    private readonly mongo: MongoService,
    private readonly gateway: QueueGateway,
  ) {
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (apiKey) {
      try {
        this.jevClient = new TypeSafeClient({ apiKey, logLevel: "off" });
        this.logger.log("JEV Cloud Client initialized for Seoulmind Restaurant recommendation flow!");
      } catch (e) {
        this.logger.error("Failed to initialize JEV Client:", e);
      }
    } else {
      this.logger.warn("TYPESAFE_API_KEY is not set. Next-action pairings will use local engine.");
    }
  }

  private async menuCollection(): Promise<Collection<MenuItem>> {
    return (await this.mongo.db()).collection<MenuItem>("menu_items");
  }

  private async ordersCollection(): Promise<Collection<OrderRecord>> {
    return (await this.mongo.db()).collection<OrderRecord>("orders");
  }

  private ensureSetup(): Promise<void> {
    this.setupOnce ??= this.setup().catch((err) => {
      this.setupOnce = null;
      throw err;
    });
    return this.setupOnce;
  }

  private async setup(): Promise<void> {
    const menu = await this.menuCollection();
    const orders = await this.ordersCollection();

    await menu.createIndex({ id: 1 }, { unique: true });
    await menu.createIndex({ category: 1 });
    await orders.createIndex({ orderNumber: 1 }, { unique: true });
    await orders.createIndex({ lineUserId: 1 });
    await orders.createIndex({ ticketId: 1 });

    // Always keep menu items synced to authentic Seoulmind menu
    await menu.deleteMany({});
    await menu.insertMany(DEFAULT_MENU);
    this.logger.log(`Seeded ${DEFAULT_MENU.length} Seoulmind (โซมายด์ เชียงใหม่) menu items into MongoDB.`);
  }

  async listMenu(category?: string): Promise<MenuItem[]> {
    await this.ensureSetup();
    const filter = category && category !== "all" ? { category: category as MenuItem["category"] } : {};
    return (await this.menuCollection()).find(filter).toArray();
  }

  async getMenuItem(id: string): Promise<MenuItem | null> {
    await this.ensureSetup();
    return (await this.menuCollection()).findOne({ id });
  }

  /**
   * แนะนำ 3 เมนูที่ลูกค้าน่าจะสั่งเพิ่มในออเดอร์ preorder ผ่าน JEV (TypeSafe)
   * JEV ให้ความน่าจะเป็นต่อทุกเมนูใน Choice เดียว → code จัดอันดับ + บังคับไม่ซ้ำหมวด
   */
  async recommendNextWithJev(dto: RecommendNextDto): Promise<{
    recommendations: Array<{ dish: MenuItem; reason: string; probability: number | null }>;
    source: "jev" | "fallback";
    latencyMs: number;
  }> {
    const started = Date.now();
    const allDishes = await this.listMenu();
    const cartIds = new Set(dto.cartItems.map((c) => c.id));
    const cartCategories = new Set(dto.cartItems.map((c) => c.category));
    // เซ็ตเป็นตัวเลือกตั้งต้นมื้อ — ตะกร้ามีของแล้วแนะนำเซ็ตซ้ำ = สั่งซ้อน
    const candidates = allDishes.filter(
      (d) => !cartIds.has(d.id) && !(d.category === "combo" && dto.cartItems.length > 0),
    );

    let ranked: Array<{ dish: MenuItem; probability: number | null }> | null = null;
    if (this.jevClient && candidates.length > 0) {
      try {
        const res = await this.jevClient.systemOne({
          model: "jev-latest",
          state: {
            restaurant: "Seoulmind (โซมายด์) Chiang Mai — Korean fried chicken, Korean dishes and bingsu",
            orderType: "Preorder: the customer orders through LINE before arriving, so everything they want must be in this order.",
            currentOrder: dto.cartItems.map((c) => ({ name: c.name, category: c.category, price: c.price })),
            lastViewedItem: allDishes.find((d) => d.id === dto.lastViewedItemId)?.name ?? null,
            customerPreference: dto.customerPreference ?? null,
            partyOrTableType: dto.tableType ?? "unknown",
          },
          questions: {
            next: choice(
              "Which single menu item is this customer most likely to add next to `currentOrder`, so the preorder becomes a complete, satisfying meal for `partyOrTableType` (e.g. a drink to go with fried or spicy food, a side, a main to share, or dessert)?",
              Object.fromEntries(
                candidates.map((d) => [d.id, `[${d.categoryName}] ${d.name} ${d.price} THB — ${d.description}`]),
              ),
            ),
          },
        });
        const probs = res.answers.next.probabilities as Record<string, number>;
        ranked = candidates
          .map((dish) => ({ dish, probability: probs[dish.id] ?? 0 }))
          .sort((a, b) => b.probability - a.probability);
      } catch (e) {
        this.logger.error("JEV call failed, using fallback ranking:", e);
      }
    }

    const source = ranked ? "jev" : "fallback";
    // ponytail: fallback = หมวดที่ยังไม่มีในตะกร้ามาก่อน ตามลำดับที่ลูกค้ามักสั่งเพิ่ม
    ranked ??= candidates
      .map((dish) => ({ dish, probability: null }))
      .sort(
        (a, b) =>
          Number(cartCategories.has(a.dish.category)) - Number(cartCategories.has(b.dish.category)) ||
          FALLBACK_CATEGORY_ORDER.indexOf(a.dish.category) - FALLBACK_CATEGORY_ORDER.indexOf(b.dish.category),
      );

    return {
      recommendations: pickDiverse(ranked, 3).map((r) => ({
        ...r,
        reason: UPSELL_REASON[r.dish.category],
      })),
      source,
      latencyMs: Date.now() - started,
    };
  }

  async createOrder(dto: CreateOrderDto): Promise<OrderRecord> {
    await this.ensureSetup();
    const allDishes = await this.listMenu();
    const dishMap = new Map(allDishes.map((d) => [d.id, d]));

    const items = dto.items.map((i) => {
      // ราคาเอาจากเมนูฝั่ง server เท่านั้น — ห้ามเชื่อ price/itemId จาก client
      const dish = dishMap.get(i.itemId);
      if (!dish) throw new BadRequestException(`ไม่พบเมนู ${i.itemId}`);
      const price = dish.price;
      return {
        itemId: i.itemId,
        name: dish.name,
        price,
        quantity: i.quantity,
        spiciness: i.spiciness,
        sauce: i.sauce,
        sweetness: i.sweetness,
        note: i.note,
        subtotal: price * i.quantity,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    // ponytail: +10000 = เลข 5 หลัก ไม่ชนเลขสุ่ม 4 หลักของออเดอร์เก่า (SM-1000..9999)
    const orderNumber = `SM-${10000 + (await this.nextOrderSeq())}`;

    const order: OrderRecord = {
      id: randomUUID(),
      orderNumber,
      branchId: dto.branchId || "demo",
      tableNumber: dto.tableNumber || "โต๊ะสั่งล่วงหน้า",
      ticketId: dto.ticketId,
      lineUserId: dto.lineUserId,
      customerName: dto.customerName || "คุณลูกค้าโซมายด์",
      phone: dto.phone,
      items,
      totalAmount,
      status: "COOKING", // ครัวกำลังเตรียมอาหารทันที
      note: dto.note,
      createdAt: new Date(),
    };

    await (await this.ordersCollection()).insertOne(order);
    this.gateway.emitOrder(order.branchId, { orderNumber, totalAmount, ticketId: order.ticketId });
    this.logger.log(`Order ${orderNumber} created for table ${order.tableNumber}: ${totalAmount} THB`);
    return order;
  }

  /** เลขออเดอร์เรียงต่อกันแบบ atomic (เดิมสุ่ม 4 หลัก ชน unique index ได้) */
  private async nextOrderSeq(): Promise<number> {
    const counters = (await this.mongo.db()).collection<{ _id: string; seq: number }>("counters");
    const doc = await counters.findOneAndUpdate(
      { _id: "orders" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return doc!.seq;
  }

  /** ออเดอร์ล่วงหน้าวันนี้ทั้งร้าน — หน้าจอพนักงานและ KDS ใช้ติดตามสถานะ */
  async getTodayOrders(branchId: string, status?: string): Promise<OrderRecord[]> {
    await this.ensureSetup();
    // ponytail: เที่ยงคืนเวลาไทย (UTC+7 ไม่มี DST)
    const DAY = 86_400_000;
    const startOfBangkokDay = new Date(Date.now() - ((Date.now() + 7 * 3_600_000) % DAY));
    const filter: Record<string, unknown> = {
      branchId,
      createdAt: { $gte: startOfBangkokDay },
    };

    if (status === "ACTIVE") {
      filter.status = { $in: ["PENDING", "COOKING", "READY"] };
    } else if (status === "ALL") {
      // ไม่กรองสถานะ เอาทั้งหมดรวม CANCELLED
    } else if (status) {
      filter.status = status;
    } else {
      filter.status = { $ne: "CANCELLED" };
    }

    return (await this.ordersCollection())
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray();
  }

  /** อัปเดตสถานะออเดอร์จากหน้าจอ KDS/Admin (เช่น COOKING -> READY -> SERVED) */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderRecord> {
    await this.ensureSetup();
    const col = await this.ordersCollection();
    const order = await col.findOne({ id: orderId });
    if (!order) throw new NotFoundException(`ไม่พบออเดอร์ ${orderId}`);

    const validStatuses: OrderStatus[] = ["PENDING", "COOKING", "READY", "SERVED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`สถานะไม่ถูกต้อง: ${status}`);
    }

    const updatedAt = new Date();
    await col.updateOne({ id: orderId }, { $set: { status, updatedAt } });

    const updatedOrder: OrderRecord = {
      ...order,
      status,
      updatedAt,
    };

    this.gateway.emitOrderUpdate(order.branchId, {
      id: order.id,
      orderNumber: order.orderNumber,
      status,
    });

    this.logger.log(`Order ${order.orderNumber} status changed to ${status}`);
    return updatedOrder;
  }

  async getMyOrders(lineUserId?: string, ticketId?: string): Promise<OrderRecord[]> {
    await this.ensureSetup();
    const query: Record<string, unknown> = {};
    if (lineUserId) query.lineUserId = lineUserId;
    else if (ticketId) query.ticketId = ticketId;
    else return [];

    return (await this.ordersCollection())
      .find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
  }
}
