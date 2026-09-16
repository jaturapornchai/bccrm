import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// หน้าจอเรียกคิวของพนักงานเคาน์เตอร์ (skeleton)
/// TODO(phase-1): เชื่อม API จริง (GET /queues/waiting, POST /queues/call-next)
/// + socket.io อัปเดต real-time
class QueueConsolePage extends ConsumerWidget {
  const QueueConsolePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('คอนโซลเรียกคิว')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('คิวถัดไป', style: TextStyle(fontSize: 18, color: Colors.grey)),
            const SizedBox(height: 8),
            Text(
              '—',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: null, // TODO: call-next
              icon: const Icon(Icons.campaign),
              label: const Text('เรียกคิวถัดไป', style: TextStyle(fontSize: 18)),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: null, // TODO: no-show
              icon: const Icon(Icons.person_off),
              label: const Text('ไม่มาตามนัด'),
            ),
          ],
        ),
      ),
    );
  }
}
