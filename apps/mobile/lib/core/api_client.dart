import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';

/// SharedPreferences instance — override ใน main() ตอน bootstrap
final sharedPrefsProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('ต้อง override sharedPrefsProvider ใน main()'),
);

/// Dio client กลาง — แนบ JWT อัตโนมัติ และดัก 401 เพื่อเด้งไป login
final apiClientProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: '$kApiBaseUrl/api',
      connectTimeout: const Duration(seconds: 5),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = ref.read(authTokenProvider);
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
    ),
  );
  return dio;
});

/// token ปัจจุบัน (อ่านจาก auth controller จริงใน auth_state.dart — ประกาศตรงนี้เพื่อเลี่ยง import วงกลม)
final authTokenProvider = StateProvider<String?>((ref) {
  final prefs = ref.watch(sharedPrefsProvider);
  return prefs.getString('bccrm_token');
});
