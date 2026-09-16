import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class AuthUser {
  const AuthUser({
    required this.id,
    required this.displayName,
    required this.role,
    required this.tenantId,
    this.branchId,
  });

  final String id;
  final String displayName;
  final String role;
  final String tenantId;
  final String? branchId;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        role: json['role'] as String,
        tenantId: json['tenantId'] as String,
        branchId: json['branchId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        'role': role,
        'tenantId': tenantId,
        'branchId': branchId,
      };
}

class AuthState {
  const AuthState({this.user, this.token});

  final AuthUser? user;
  final String? token;

  bool get isAuthenticated => token != null && user != null;
}

/// จัดการ session ฝั่งร้าน — login/logout + เก็บ token ลงเครื่อง
class AuthController extends Notifier<AuthState> {
  static const _tokenKey = 'bccrm_token';
  static const _userKey = 'bccrm_user';

  @override
  AuthState build() {
    final prefs = ref.watch(sharedPrefsProvider);
    final token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    if (token != null && userJson != null) {
      try {
        final user = AuthUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
        // sync token เข้า provider กลางให้ Dio ใช้
        Future.microtask(() => ref.read(authTokenProvider.notifier).state = token);
        return AuthState(user: user, token: token);
      } catch (_) {
        // ข้อมูลเสีย — ถือว่ายังไม่ login
      }
    }
    return const AuthState();
  }

  /// login กับ backend จริง — คืน null ถ้าสำเร็จ, คืนข้อความ error ถ้าไม่ผ่าน
  Future<String?> login(String email, String password) async {
    try {
      final dio = ref.read(apiClientProvider);
      final res = await dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      final data = res.data!;
      final token = data['accessToken'] as String;
      final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);

      final prefs = ref.read(sharedPrefsProvider);
      await prefs.setString(_tokenKey, token);
      await prefs.setString(_userKey, jsonEncode(user.toJson()));

      ref.read(authTokenProvider.notifier).state = token;
      state = AuthState(user: user, token: token);
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['message'] != null) return body['message'].toString();
      if (e.type == DioExceptionType.connectionError) {
        return 'เชื่อมต่อ server ไม่ได้ — ตรวจสอบว่า backend รันอยู่';
      }
      return 'เข้าสู่ระบบไม่สำเร็จ (${e.response?.statusCode ?? "-"})';
    }
  }

  Future<void> logout() async {
    final prefs = ref.read(sharedPrefsProvider);
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    ref.read(authTokenProvider.notifier).state = null;
    state = const AuthState();
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
