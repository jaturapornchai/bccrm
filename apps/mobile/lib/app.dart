import 'package:flutter/material.dart';

import 'features/staff/queue_console_page.dart';

/// BCCRM App — ใช้ร่วมกัน 3 โหมด:
/// 1) แอปพนักงาน/เจ้าของร้าน (เรียกคิว ดูรายงาน)
/// 2) Kiosk กดบัตรคิวหน้าร้าน (Android: lock task mode / iPad: Guided Access)
/// 3) จอแสดงคิว TV/Signage
/// TODO(phase-1): login + เลือกโหมดตามสิทธิ์/อุปกรณ์
class BccrmApp extends StatelessWidget {
  const BccrmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BCCRM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF06C755)),
        useMaterial3: true,
        fontFamily: 'Sarabun',
      ),
      home: const QueueConsolePage(),
    );
  }
}
