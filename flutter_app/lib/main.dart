import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:boabat_alarabi/core/plate_engine.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BoabatAlarabiApp());
}

class BoabatAlarabiApp extends StatelessWidget {
  const BoabatAlarabiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'بوابة العربي',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar', 'SA'),
      supportedLocales: const [
        Locale('ar', 'SA'),
        Locale('ar', 'EG'),
      ],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0F19),
        primaryColor: const Color(0xFF26E6C8),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF26E6C8),
          secondary: Color(0xFF1AD1B5),
          error: Color(0xFFFF4757),
          surface: Color(0xFF131B2A),
        ),
        textTheme: GoogleFonts.cairoTextTheme(ThemeData.dark().textTheme),
        useMaterial3: true,
      ),
      home: const MainNavigationScreen(),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 1; // Default to Center tab (الفحص / Scan)

  final List<Map<String, dynamic>> _scans = [
    {
      'id': '1',
      'letters': 'ا س ب',
      'numbers': '2175',
      'display': 'ا س ب 2175',
      'canonical': 'اسب2175',
      'wanted': true,
      'type': 'شاحنة',
      'bank': 'طلال السديس',
      'vin': 'KLUKH2T41PK000154',
      'time': '12:20 م',
      'gps': '24.7136, 46.6753'
    },
    {
      'id': '2',
      'letters': 'ر ك د',
      'numbers': '9678',
      'display': 'ر ك د 9678',
      'canonical': 'ركد9678',
      'wanted': true,
      'type': 'Taurus',
      'bank': 'اشرف جمال',
      'vin': '-',
      'time': '12:21 م',
      'gps': '24.7140, 46.6758'
    },
    {
      'id': '3',
      'letters': 'د ا د',
      'numbers': '2524',
      'display': 'د ا د 2524',
      'canonical': 'داد2524',
      'wanted': false,
      'type': '-',
      'bank': '-',
      'vin': '-',
      'time': '12:22 م',
      'gps': '24.7145, 46.6762'
    },
    {
      'id': '4',
      'letters': 'د ب ك',
      'numbers': '2121',
      'display': 'د ب ك 2121',
      'canonical': 'دبك2121',
      'wanted': false,
      'type': '-',
      'bank': '-',
      'vin': '-',
      'time': '12:23 م',
      'gps': '24.7150, 46.6765'
    },
  ];

  void _addScan(String phrase) {
    final candidates = FlutterPlateEngine.parse(phrase);
    if (candidates.isNotEmpty) {
      final c = candidates.first;
      final isWanted = (c.canonicalPlate == 'اسب2175' || c.canonicalPlate == 'ركد9678');
      setState(() {
        _scans.insert(0, {
          'id': DateTime.now().millisecondsSinceEpoch.toString(),
          'letters': c.letters,
          'numbers': c.numbers,
          'display': c.plateDisplay,
          'canonical': c.canonicalPlate,
          'wanted': isWanted,
          'type': isWanted ? (c.canonicalPlate == 'اسب2175' ? 'شاحنة' : 'Taurus') : '-',
          'bank': isWanted ? (c.canonicalPlate == 'اسب2175' ? 'طلال السديس' : 'اشرف جمال') : '-',
          'vin': isWanted ? (c.canonicalPlate == 'اسب2175' ? 'KLUKH2T41PK000154' : '-') : '-',
          'time': 'الآن',
          'gps': '24.7136, 46.6753'
        });
      });
      if (isWanted) {
        _showWantedDialog(_scans.first);
      }
    }
  }

  void _showWantedDialog(Map<String, dynamic> scan) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1D1016),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xFFFF4757), width: 2),
        ),
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Color(0xFFFF4757), size: 28),
            SizedBox(width: 8),
            Text('تنبيه: سيارة مطلوبة!', style: TextStyle(color: Color(0xFFFF4757), fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFF4757)),
                ),
                child: Text(
                  scan['display'],
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('النوع: ${scan['type']}', style: const TextStyle(fontWeight: FontWeight.bold)),
            Text('الجهة / البنك: ${scan['bank']}', style: const TextStyle(fontWeight: FontWeight.bold)),
            Text('الهيكل: ${scan['vin']}'),
            Text('الموقع: ${scan['gps']}'),
          ],
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF4757),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('متابعة الفحص'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wantedCount = _scans.where((s) => s['wanted'] == true).length;

    final screens = [
      WantedScreen(scans: _scans.where((s) => s['wanted'] == true).toList()),
      ScanMainScreen(scans: _scans, onAddScan: _addScan),
      const HistoryAndDatasetsScreen(),
    ];

    return Scaffold(
      body: screens[_currentIndex],
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0E1624),
          border: Border(top: BorderSide(color: Color(0xFF1E2D48))),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (idx) => setState(() => _currentIndex = idx),
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: const Color(0xFF26E6C8),
          unselectedItemColor: const Color(0xFF8B9BB4),
          items: [
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: wantedCount > 0,
                label: Text('$wantedCount'),
                backgroundColor: const Color(0xFFFF4757),
                child: const Icon(Icons.notifications_active_outlined),
              ),
              activeIcon: const Icon(Icons.notifications_active),
              label: 'مطلوب',
            ),
            const BottomNavigationBarItem(
              icon: CircleAvatar(
                radius: 26,
                backgroundColor: Color(0xFF26E6C8),
                child: Icon(Icons.camera_alt, color: Color(0xFF0A131F), size: 28),
              ),
              label: 'الفحص',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.grid_view),
              label: 'الكل',
            ),
          ],
        ),
      ),
    );
  }
}

// 1. SCAN MAIN SCREEN
class ScanMainScreen extends StatefulWidget {
  final List<Map<String, dynamic>> scans;
  final Function(String) onAddScan;

  const ScanMainScreen({super.key, required this.scans, required this.onAddScan});

  @override
  State<ScanMainScreen> createState() => _ScanMainScreenState();
}

class _ScanMainScreenState extends State<ScanMainScreen> {
  bool _isListening = false;

  @override
  Widget build(BuildContext context) {
    final total = widget.scans.length;
    final wanted = widget.scans.where((s) => s['wanted'] == true).length;
    final cleared = total - wanted;

    return SafeArea(
      child: Column(
        children: [
          // Top Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFF26E6C8)),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.view_in_ar, color: Color(0xFF26E6C8)),
                    ),
                    const SizedBox(width: 10),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('بوابة العربي', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text('قاعدة المطلوبين: 56,481 سيارة', style: TextStyle(fontSize: 11, color: Color(0xFF26E6C8))),
                      ],
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.logout, color: Color(0xFF8B9BB4)),
                  onPressed: () {},
                ),
              ],
            ),
          ),

          // Main Voice Card
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF131B2A),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF1E2D48)),
            ),
            child: Column(
              children: [
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF26E6C8),
                      foregroundColor: const Color(0xFF0A131F),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: () => setState(() => _isListening = !_isListening),
                    icon: Icon(_isListening ? Icons.stop : Icons.mic),
                    label: Text(
                      _isListening ? 'إيقاف الجلسة الصوتية' : 'بدء الجلسة الصوتية',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  _isListening ? 'يستمع الآن... تفضل بنطق اللوحة' : 'جاهز للمسح الصوتي المستمر',
                  style: TextStyle(
                    color: _isListening ? const Color(0xFF26E6C8) : const Color(0xFF8B9BB4),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                // Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      ActionChip(
                        avatar: const Icon(Icons.flash_on, size: 16, color: Color(0xFF26E6C8)),
                        label: const Text('الوضع السريع', style: TextStyle(fontSize: 11)),
                        backgroundColor: const Color(0xFF182338),
                        onPressed: () {},
                      ),
                      const SizedBox(width: 8),
                      ActionChip(
                        avatar: const Icon(Icons.location_on, size: 16, color: Color(0xFF26E6C8)),
                        label: const Text('GPS نشط', style: TextStyle(fontSize: 11)),
                        backgroundColor: const Color(0xFF182338),
                        onPressed: () {},
                      ),
                      const SizedBox(width: 8),
                      ActionChip(
                        label: const Text('🗣 تجربة: اسب 2175', style: TextStyle(fontSize: 11, color: Color(0xFFFF4757))),
                        backgroundColor: const Color(0xFF182338),
                        onPressed: () => widget.onAddScan('اسب 2175'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Stats row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(color: const Color(0xFF131B2A), borderRadius: BorderRadius.circular(12)),
                    child: Column(children: [Text('$total', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)), const Text('الإجمالي', style: TextStyle(fontSize: 11, color: Color(0xFF8B9BB4)))]),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(color: const Color(0xFF131B2A), borderRadius: BorderRadius.circular(12)),
                    child: Column(children: [Text('$wanted', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFFFF4757))), const Text('مطلوبة ⚠️', style: TextStyle(fontSize: 11, color: Color(0xFF8B9BB4)))]),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(color: const Color(0xFF131B2A), borderRadius: BorderRadius.circular(12)),
                    child: Column(children: [Text('$cleared', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF2ED573))), const Text('سليمة ✔', style: TextStyle(fontSize: 11, color: Color(0xFF8B9BB4)))]),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Results Table
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFF131B2A),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF1E2D48)),
              ),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: const BoxDecoration(
                      color: Color(0xFF0E1624),
                      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('#', style: TextStyle(color: Color(0xFF8B9BB4), fontWeight: FontWeight.bold)),
                        Text('الحروف', style: TextStyle(color: Color(0xFF8B9BB4), fontWeight: FontWeight.bold)),
                        Text('الأرقام', style: TextStyle(color: Color(0xFF8B9BB4), fontWeight: FontWeight.bold)),
                        Text('الحالة', style: TextStyle(color: Color(0xFF8B9BB4), fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: widget.scans.length,
                      itemBuilder: (context, idx) {
                        final scan = widget.scans[idx];
                        final isWanted = scan['wanted'] == true;
                        return Container(
                          decoration: BoxDecoration(
                            color: isWanted ? const Color(0x1AFF4757) : Colors.transparent,
                            border: const Border(bottom: BorderSide(color: Color(0x10FFFFFF))),
                          ),
                          child: ListTile(
                            leading: Text('${widget.scans.length - idx}', style: const TextStyle(color: Color(0xFF8B9BB4))),
                            title: Text(scan['letters'], textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                            subtitle: Text(scan['numbers'], textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF26E6C8), fontSize: 18, fontWeight: FontWeight.bold)),
                            trailing: isWanted
                                ? const Icon(Icons.warning_amber_rounded, color: Color(0xFFFF4757))
                                : const Icon(Icons.check_circle, color: Color(0xFF2ED573)),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

// 2. WANTED SCREEN
class WantedScreen extends StatelessWidget {
  final List<Map<String, dynamic>> scans;
  const WantedScreen({super.key, required this.scans});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('🚨 قائمة السيارات المطلوبة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0x20FF4757),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFFF4757)),
                  ),
                  child: Text('${scans.length} سيارة', style: const TextStyle(color: Color(0xFFFF4757), fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: scans.isEmpty
                  ? const Center(child: Text('لا توجد سيارات مطلوبة مسجلة في هذه الجلسة'))
                  : ListView.builder(
                      itemCount: scans.length,
                      itemBuilder: (ctx, i) {
                        final item = scans[i];
                        return Card(
                          color: const Color(0xFF131B2A),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                            side: const BorderSide(color: Color(0x60FF4757)),
                          ),
                          margin: const EdgeInsets.only(bottom: 12),
                          child: Padding(
                            padding: const EdgeInsets.all(14.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFFF4757),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(item['display'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                    ),
                                    Text(item['time'], style: const TextStyle(color: Color(0xFF8B9BB4), fontSize: 12)),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text('نوع السيارة: ${item['type']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                Text('الجهة / البنك: ${item['bank']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                Text('رقم الهيكل (VIN): ${item['vin']}', style: const TextStyle(color: Color(0xFF8B9BB4))),
                                Text('الموقع: ${item['gps']}', style: const TextStyle(color: Color(0xFF26E6C8))),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

// 3. HISTORY & DATASETS SCREEN
class HistoryAndDatasetsScreen extends StatelessWidget {
  const HistoryAndDatasetsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: SafeArea(
        child: Column(
          children: [
            const TabBar(
              indicatorColor: Color(0xFF26E6C8),
              labelColor: Color(0xFF26E6C8),
              unselectedLabelColor: Color(0xFF8B9BB4),
              tabs: [
                Tab(text: 'الجلسات'),
                Tab(text: 'ملفات Excel'),
                Tab(text: 'الإعدادات'),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  // Tab 1: Sessions
                  ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Card(
                        color: const Color(0xFF131B2A),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        child: const Padding(
                          padding: EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('جلسة اليوم (نشطة)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                              SizedBox(height: 8),
                              Text('الإجمالي: 4 | المطلوبة: 2 | السليمة: 2', style: TextStyle(color: Color(0xFF8B9BB4))),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  // Tab 2: Excel
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Card(
                      color: const Color(0xFF131B2A),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: const BorderSide(color: Color(0xFF26E6C8)),
                      ),
                      child: const Padding(
                        padding: EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('⭐ القائمة المفعلة حاليًا', style: TextStyle(color: Color(0xFF26E6C8), fontWeight: FontWeight.bold)),
                            SizedBox(height: 8),
                            Text('قاعدة المطلوبين الرئيسية (file.xlsx)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                            Text('56,481 سيارة مفهرسة | 2 شيتات (تشييك، تسجيل)', style: TextStyle(color: Color(0xFF8B9BB4))),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Tab 3: Settings
                  ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      SwitchListTile(
                        value: true,
                        onChanged: (v) {},
                        title: const Text('التنبيه الصوتي (Siren)'),
                      ),
                      SwitchListTile(
                        value: true,
                        onChanged: (v) {},
                        title: const Text('الاهتزاز عند التنبيه'),
                      ),
                      SwitchListTile(
                        value: true,
                        onChanged: (v) {},
                        title: const Text('تسجيل موقع GPS تلقائيًا'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
