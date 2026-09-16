import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// HTTP client กลาง — ชี้ไปที่ BCCRM API
final apiClientProvider = Provider<Dio>((ref) {
  // TODO: อ่านจาก config/หน้าตั้งค่า รองรับ self-host หลายโดเมน
  const baseUrl = String.fromEnvironment(
    'BCCRM_API_URL',
    defaultValue: 'http://localhost:3001',
  );
  return Dio(BaseOptions(baseUrl: '$baseUrl/api'));
});
