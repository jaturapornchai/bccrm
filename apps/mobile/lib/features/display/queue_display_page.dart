import 'package:flutter/material.dart';

/// จอแสดงคิวสำหรับ TV/Signage หน้าร้าน (skeleton)
/// TODO(phase-1): ฟัง socket.io event `queue:call` + TTS เรียกเลขคิวภาษาไทย
class QueueDisplayPage extends StatelessWidget {
  const QueueDisplayPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('กำลังเรียก', style: TextStyle(color: Colors.white54, fontSize: 32)),
            SizedBox(height: 16),
            Text('—', style: TextStyle(color: Colors.white, fontSize: 160, fontWeight: FontWeight.bold)),
            SizedBox(height: 16),
            Text('เคาน์เตอร์ —', style: TextStyle(color: Colors.white70, fontSize: 40)),
          ],
        ),
      ),
    );
  }
}
