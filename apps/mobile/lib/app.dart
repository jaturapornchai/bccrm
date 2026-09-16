import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/auth_state.dart';
import 'features/auth/login_page.dart';
import 'features/staff/queue_console_page.dart';

/// BCCRM App — ใช้ร่วมกัน 3 โหมด:
/// 1) แอปพนักงาน/เจ้าของร้าน (เรียกคิว ดูรายงาน) ← ทำงานแล้ว
/// 2) Kiosk กดบัตรคิวหน้าร้าน (phase ถัดไป)
/// 3) จอแสดงคิว TV/Signage (phase ถัดไป)
class BccrmApp extends ConsumerWidget {
  const BccrmApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    return MaterialApp(
      title: 'BCCRM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF06C755)),
        useMaterial3: true,
        fontFamily: 'Sarabun',
      ),
      home: auth.isAuthenticated ? const QueueConsolePage() : const LoginPage(),
    );
  }
}
