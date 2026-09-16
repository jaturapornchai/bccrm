import 'package:flutter/material.dart';

/// หน้าจอ Kiosk กดบัตรคิวหน้าร้าน (skeleton)
/// TODO(phase-1): เลือกบริการ → POST /queues/tickets → พิมพ์บัตร (esc_pos_printer)
/// หรือแสดง QR ให้ลูกค้าสแกนรับบัตรคิวใน LINE
class KioskTicketPage extends StatelessWidget {
  const KioskTicketPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('กรุณาเลือกบริการ', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 24),
              for (final service in const ['บริการทั่วไป', 'ตัวอย่างบริการ 2'])
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 48),
                  child: SizedBox(
                    width: double.infinity,
                    height: 72,
                    child: FilledButton(
                      onPressed: null, // TODO: ออกคิว
                      child: Text(service, style: const TextStyle(fontSize: 22)),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
