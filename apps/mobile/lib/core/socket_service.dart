import 'package:socket_io_client/socket_io_client.dart' as io;

import 'config.dart';

/// เชื่อม socket.io ของ backend เพื่อรับอัปเดตคิว real-time
/// server ยิง event ผ่านห้อง `branch:<branchId>`:
///  - queue:update → คิวสร้าง/เปลี่ยนสถานะ (ให้ refetch)
///  - queue:call   → มีการเรียกคิว (แสดงเลขบนจอ/แจ้งเตือน)
class QueueSocket {
  io.Socket? _socket;

  bool get connected => _socket?.connected ?? false;

  void connect({
    required String branchId,
    void Function(dynamic payload)? onUpdate,
    void Function(dynamic payload)? onCall,
  }) {
    disconnect();
    _socket = io.io(
      kApiBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );

    _socket!
      ..onConnect((_) => _socket!.emit('join-branch', branchId))
      ..on('queue:update', (data) => onUpdate?.call(data))
      ..on('queue:call', (data) => onCall?.call(data))
      ..onConnectError((e) => {/* เงียบไว้ — หน้าจอจะ fallback เป็น refresh เอง */})
      ..connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
