import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../auth/auth_state.dart';

/// ตั๋วคิวใบเดียว (โครงตรงกับ TicketRecord ของ backend)
class QueueTicket {
  const QueueTicket({
    required this.id,
    required this.number,
    required this.state,
    required this.isVip,
    required this.source,
    required this.createdAt,
  });

  final String id;
  final String number;
  final String state;
  final bool isVip;
  final String source;
  final DateTime createdAt;

  int get waitedMinutes =>
      DateTime.now().difference(createdAt).inMinutes.clamp(0, 99999);

  factory QueueTicket.fromJson(Map<String, dynamic> json) => QueueTicket(
        id: json['id'] as String,
        number: json['number'] as String,
        state: json['state'] as String,
        isVip: json['isVip'] as bool? ?? false,
        source: json['source'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

String _branchId(Ref ref) =>
    ref.watch(authControllerProvider).user?.branchId ?? kDefaultBranchId;

/// คิวที่รอเรียก (เรียงตามนโยบายจาก backend แล้ว)
final waitingQueueProvider = FutureProvider.autoDispose<List<QueueTicket>>((ref) async {
  final dio = ref.watch(apiClientProvider);
  final res = await dio.get<List<dynamic>>(
    '/queues/waiting',
    queryParameters: {'branchId': _branchId(ref)},
  );
  return res.data!
      .map((e) => QueueTicket.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// สถิติคิววันนี้แยกสถานะ
final todayStatsProvider = FutureProvider.autoDispose<Map<String, int>>((ref) async {
  final dio = ref.watch(apiClientProvider);
  final res = await dio.get<Map<String, dynamic>>(
    '/queues/stats/today',
    queryParameters: {'branchId': _branchId(ref)},
  );
  return res.data!.map((k, v) => MapEntry(k, (v as num).toInt()));
});

/// กระบวนการทำงานกับคิว — เรียกคิว/เปลี่ยนสถานะ แล้ว invalidate ให้โหลดใหม่
class QueueActions {
  const QueueActions(this.ref);

  final Ref ref;

  Future<QueueTicket> callNext() async {
    final dio = ref.read(apiClientProvider);
    final auth = ref.read(authControllerProvider);
    final res = await dio.post<Map<String, dynamic>>(
      '/queues/call-next',
      data: {
        'branchId': _branchId(ref),
        'counterId': kDefaultCounterId,
        'staffId': auth.user?.id ?? 'staff-demo',
      },
    );
    refresh();
    return QueueTicket.fromJson(res.data!);
  }

  Future<void> changeState(String ticketId, String state) async {
    final dio = ref.read(apiClientProvider);
    await dio.patch<void>('/queues/tickets/$ticketId/state/$state');
    refresh();
  }

  void refresh() {
    ref.invalidate(waitingQueueProvider);
    ref.invalidate(todayStatsProvider);
  }
}

final queueActionsProvider = Provider<QueueActions>((ref) => QueueActions(ref));
