import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../core/socket_service.dart';
import '../auth/auth_state.dart';
import 'queue_controller.dart';

const _stateLabel = <String, ({String label, Color color})>{
  'BOOKED': (label: 'จองไว้', color: Color(0xFF3B82F6)),
  'WAITING': (label: 'รอเรียก', color: Color(0xFFF59E0B)),
  'CALLED': (label: 'กำลังเรียก', color: Color(0xFFE02020)),
  'SERVING': (label: 'กำลังบริการ', color: Color(0xFF8B5CF6)),
  'DONE': (label: 'เสร็จสิ้น', color: Color(0xFF6B7280)),
  'NO_SHOW': (label: 'ไม่มาตามนัด', color: Color(0xFF9CA3AF)),
};

const _sourceLabel = <String, String>{
  'LINE_BOOKING': 'จองผ่าน LINE',
  'WALK_IN_KIOSK': 'Kiosk หน้าร้าน',
  'STAFF_CREATED': 'พนักงานเปิดให้',
};

/// คอนโซลเรียกคิวของพนักงาน — เชื่อม backend จริง + realtime ผ่าน socket.io
class QueueConsolePage extends ConsumerStatefulWidget {
  const QueueConsolePage({super.key});

  @override
  ConsumerState<QueueConsolePage> createState() => _QueueConsolePageState();
}

class _QueueConsolePageState extends ConsumerState<QueueConsolePage> {
  final _socket = QueueSocket();
  String? _lastCalled;
  bool _socketLive = false;
  bool _calling = false;

  @override
  void initState() {
    super.initState();
    _connectSocket();
  }

  void _connectSocket() {
    final branchId =
        ref.read(authControllerProvider).user?.branchId ?? kDefaultBranchId;
    _socket.connect(
      branchId: branchId,
      onUpdate: (_) {
        // คิวเปลี่ยนที่ server → โหลดข้อมูลใหม่
        ref.read(queueActionsProvider).refresh();
        if (!_socketLive && mounted) setState(() => _socketLive = true);
      },
      onCall: (payload) {
        if (payload is Map && mounted) {
          setState(() => _lastCalled = '${payload['number']}');
        }
      },
    );
    // ถือว่า live ถ้า connect สำเร็จภายใน 2 วิ
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted && _socket.connected) setState(() => _socketLive = true);
    });
  }

  @override
  void dispose() {
    _socket.disconnect();
    super.dispose();
  }

  Future<void> _callNext() async {
    setState(() => _calling = true);
    try {
      final ticket = await ref.read(queueActionsProvider).callNext();
      if (mounted) setState(() => _lastCalled = ticket.number);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('เรียกคิวไม่สำเร็จ: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _calling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final waiting = ref.watch(waitingQueueProvider);
    final stats = ref.watch(todayStatsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('คอนโซลเรียกคิว — ${auth.user?.displayName ?? ""}'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Chip(
              avatar: Icon(
                Icons.circle,
                size: 10,
                color: _socketLive ? Colors.green : Colors.grey,
              ),
              label: Text(_socketLive ? 'realtime' : 'polling'),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(queueActionsProvider).refresh(),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'ออกจากระบบ',
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.read(queueActionsProvider).refresh(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_lastCalled != null)
              Card(
                color: const Color(0xFF06C755),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const Text('กำลังเรียก',
                          style: TextStyle(color: Colors.white70)),
                      Text(
                        _lastCalled!,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 56,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),
            stats.when(
              data: (s) => Wrap(
                spacing: 8,
                runSpacing: 8,
                children: s.entries
                    .map((e) => Chip(
                          label: Text(
                            '${_stateLabel[e.key]?.label ?? e.key}: ${e.value}',
                          ),
                        ))
                    .toList(),
              ),
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('โหลดสถิติไม่สำเร็จ: $e'),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _calling ? null : _callNext,
              icon: const Icon(Icons.campaign),
              label: Text(
                _calling ? 'กำลังเรียก…' : 'เรียกคิวถัดไป',
                style: const TextStyle(fontSize: 18),
              ),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 18),
              ),
            ),
            const SizedBox(height: 20),
            Text('คิวที่รอเรียก',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            waiting.when(
              data: (tickets) => tickets.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: Text('ไม่มีคิวที่รออยู่ 🎉')),
                    )
                  : Column(
                      children: tickets
                          .map((t) => Card(
                                child: ListTile(
                                  leading: Text(
                                    t.number,
                                    style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  title: Text(
                                    '${_stateLabel[t.state]?.label ?? t.state}'
                                    '${t.isVip ? " ⭐ VIP" : ""}',
                                  ),
                                  subtitle: Text(
                                    '${_sourceLabel[t.source] ?? t.source} · รอมา ${t.waitedMinutes} นาที',
                                  ),
                                ),
                              ))
                          .toList(),
                    ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text('โหลดคิวไม่สำเร็จ: $e'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
