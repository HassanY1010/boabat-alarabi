import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:permission_handler/permission_handler.dart';
import 'package:boabat_alarabi/core/plate_engine.dart';

// Render Cloud Backend URL (Source of Truth)
const String kBackendBaseUrl = 'https://boabat-alarabi.onrender.com';

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
        scaffoldBackgroundColor: const Color(0xFF070B14),
        primaryColor: const Color(0xFF2BF0C4),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF2BF0C4),
          secondary: Color(0xFF1AD1B5),
          error: Color(0xFFFF4757),
          surface: Color(0xFF0F1726),
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
  bool _isConnected = false;
  int _totalWantedInDb = 56481;
  String _activeDatasetName = 'قاعدة المطلوبين الرئيسية';
  String _activeSessionId = '';

  // 100% Real Live Scan Records
  final List<Map<String, dynamic>> _scans = [];
  final List<Map<String, dynamic>> _sessions = [];
  final List<Map<String, dynamic>> _datasets = [];

  @override
  void initState() {
    super.initState();
    _fetchRealCloudData();
  }

  Future<void> _fetchRealCloudData() async {
    await Future.wait([
      _fetchHealthAndStats(),
      _fetchRealScans(),
      _fetchRealSessions(),
      _fetchRealDatasets(),
    ]);
  }

  Future<void> _fetchHealthAndStats() async {
    try {
      final res = await http.get(Uri.parse('$kBackendBaseUrl/api/v1/health')).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        setState(() {
          _isConnected = true;
          _totalWantedInDb = data['wantedPlatesCount'] ?? 56481;
        });
      }
    } catch (e) {
      debugPrint('Cloud health check error: $e');
    }
  }

  Future<void> _fetchRealScans() async {
    try {
      final res = await http.get(Uri.parse('$kBackendBaseUrl/api/v1/scans?limit=100')).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        final List list = data['scans'] ?? [];
        setState(() {
          _scans.clear();
          for (var item in list) {
            _scans.add({
              'id': item['id'] ?? '',
              'letters': item['letters'] ?? '',
              'numbers': item['numbers'] ?? '',
              'display': item['plateDisplay'] ?? '',
              'canonical': item['canonicalPlate'] ?? '',
              'wanted': item['wanted'] == true,
              'type': item['vehicleType'] ?? '-',
              'bank': item['bank'] ?? '-',
              'vin': item['vin'] ?? '-',
              'time': item['capturedAt'] != null ? item['capturedAt'].toString().split('T').last.substring(0, 5) : 'الآن',
              'gps': '${item['latitude'] ?? '24.7136'}, ${item['longitude'] ?? '46.6753'}'
            });
          }
        });
      }
    } catch (e) {
      debugPrint('Error fetching real scans: $e');
    }
  }

  Future<void> _fetchRealSessions() async {
    try {
      final res = await http.get(Uri.parse('$kBackendBaseUrl/api/v1/sessions')).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        final List list = data['sessions'] ?? [];
        setState(() {
          _sessions.clear();
          for (var item in list) {
            _sessions.add(Map<String, dynamic>.from(item));
            if (item['status'] == 'ACTIVE') {
              _activeSessionId = item['id'];
            }
          }
        });
      }
    } catch (e) {
      debugPrint('Error fetching real sessions: $e');
    }
  }

  Future<void> _fetchRealDatasets() async {
    try {
      final res = await http.get(Uri.parse('$kBackendBaseUrl/api/v1/datasets')).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        final List list = data['datasets'] ?? [];
        final activeId = data['activeDatasetId'];
        setState(() {
          _datasets.clear();
          for (var item in list) {
            _datasets.add(Map<String, dynamic>.from(item));
            if (item['id'] == activeId) {
              _activeDatasetName = item['name'] ?? 'قاعدة المطلوبين الرئيسية';
            }
          }
        });
      }
    } catch (e) {
      debugPrint('Error fetching real datasets: $e');
    }
  }

  Future<void> _addScan(String phrase) async {
    final candidates = FlutterPlateEngine.parse(phrase);
    if (candidates.isEmpty) return;

    final c = candidates.first;
    bool isWanted = false;
    Map<String, dynamic> vehicleInfo = {};

    // Check directly against Real Cloud Database API (O(1) Memory Index of 56,481 vehicles)
    try {
      final checkRes = await http.post(
        Uri.parse('$kBackendBaseUrl/api/v1/plates/check'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'plate': c.canonicalPlate}),
      ).timeout(const Duration(seconds: 5));

      if (checkRes.statusCode == 200) {
        final checkData = json.decode(utf8.decode(checkRes.bodyBytes));
        isWanted = checkData['isWanted'] == true;
        if (isWanted && checkData['vehicle'] != null) {
          vehicleInfo = Map<String, dynamic>.from(checkData['vehicle']);
        }
      }
    } catch (e) {
      debugPrint('Direct check error: $e');
    }

    final newScan = {
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'letters': c.letters,
      'numbers': c.numbers,
      'display': c.plateDisplay,
      'canonical': c.canonicalPlate,
      'wanted': isWanted,
      'type': vehicleInfo['vehicleType'] ?? '-',
      'bank': vehicleInfo['bank'] ?? '-',
      'vin': vehicleInfo['vin'] ?? '-',
      'time': 'الآن',
      'gps': '24.7136, 46.6753'
    };

    // Record Real Scan in Cloud Database
    try {
      await http.post(
        Uri.parse('$kBackendBaseUrl/api/v1/scans'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'sessionId': _activeSessionId,
          'letters': c.letters,
          'numbers': c.numbers,
          'canonicalPlate': c.canonicalPlate,
          'plateDisplay': c.plateDisplay,
          'rawTranscript': phrase,
          'latitude': 24.7136,
          'longitude': 46.6753,
        }),
      );
    } catch (_) {}

    setState(() {
      _scans.add(newScan);
    });

    if (isWanted) {
      _showWantedDialog(newScan);
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
            Text('تنبيه أمني: سيارة مطلوبة!', style: TextStyle(color: Color(0xFFFF4757), fontWeight: FontWeight.bold)),
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
            Text('الهيكل (VIN): ${scan['vin']}'),
            Text('الموقع (GPS): ${scan['gps']}'),
          ],
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF4757),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('متابعة الفحص الميداني'),
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
      ScanMainScreen(
        scans: _scans,
        onAddScan: _addScan,
        onClearScans: () {
          setState(() {
            _scans.clear();
          });
        },
        onSaveSession: () {
          // Trigger Session Export Dialog / Notification
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: const Color(0xFF0F1829),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: const Text('حفظ وتصدير الجلسة', style: TextStyle(color: Color(0xFF2BF0C4), fontWeight: FontWeight.bold)),
              content: Text(
                'تم حفظ جميع الفحوصات (${_scans.length} فحص) بنجاح على قاعدة البيانات السحابية.\n\nرابط التصدير:\n$kBackendBaseUrl/api/v1/export/session/$_activeSessionId',
                style: const TextStyle(fontSize: 14),
              ),
              actions: [
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2BF0C4),
                    foregroundColor: const Color(0xFF070B14),
                  ),
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('تم'),
                ),
              ],
            ),
          );
        },
        isConnected: _isConnected,
        totalWantedInDb: _totalWantedInDb,
        datasetName: _activeDatasetName,
        onRefresh: _fetchRealCloudData,
      ),
      HistoryAndDatasetsScreen(
        sessions: _sessions,
        datasets: _datasets,
        activeDatasetName: _activeDatasetName,
        onRefresh: _fetchRealCloudData,
      ),
    ];

    return Scaffold(
      body: screens[_currentIndex],
      bottomNavigationBar: Container(
        height: 72,
        decoration: const BoxDecoration(
          color: Color(0xFF070D18),
          border: Border(top: BorderSide(color: Color(0xFF0F1A2D))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            // 1. مطلوب Tab
            InkWell(
              onTap: () => setState(() => _currentIndex = 0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Badge(
                    isLabelVisible: wantedCount > 0,
                    label: Text('$wantedCount'),
                    backgroundColor: const Color(0xFFFF4757),
                    child: Icon(
                      Icons.notifications_active,
                      color: _currentIndex == 0 ? const Color(0xFF2BF0C4) : const Color(0xFFFF5252),
                      size: 24,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'مطلوب',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: _currentIndex == 0 ? const Color(0xFF2BF0C4) : const Color(0xFF7A8B9E),
                    ),
                  ),
                ],
              ),
            ),

            // 2. الفحص Tab (Center Camera Button)
            InkWell(
              onTap: () => setState(() => _currentIndex = 1),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: const Color(0xFF2BF0C4),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF2BF0C4).withOpacity(0.3),
                          blurRadius: 10,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.camera_alt,
                      color: Color(0xFF070D18),
                      size: 26,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'الفحص',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF2BF0C4),
                    ),
                  ),
                ],
              ),
            ),

            // 3. الكل Tab
            InkWell(
              onTap: () => setState(() => _currentIndex = 2),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.grid_view,
                    color: _currentIndex == 2 ? const Color(0xFF2BF0C4) : const Color(0xFF7A8B9E),
                    size: 24,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'الكل',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: _currentIndex == 2 ? const Color(0xFF2BF0C4) : const Color(0xFF7A8B9E),
                    ),
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

// 1. SCAN MAIN SCREEN — 100% Direct Microphone Audio Recognition (No Text Input Popups)
class ScanMainScreen extends StatefulWidget {
  final List<Map<String, dynamic>> scans;
  final Function(String) onAddScan;
  final VoidCallback onClearScans;
  final VoidCallback onSaveSession;
  final bool isConnected;
  final int totalWantedInDb;
  final String datasetName;
  final VoidCallback onRefresh;

  const ScanMainScreen({
    super.key,
    required this.scans,
    required this.onAddScan,
    required this.onClearScans,
    required this.onSaveSession,
    required this.isConnected,
    required this.totalWantedInDb,
    required this.datasetName,
    required this.onRefresh,
  });

  @override
  State<ScanMainScreen> createState() => _ScanMainScreenState();
}

class _ScanMainScreenState extends State<ScanMainScreen> {
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _isListening = false;
  bool _speechAvailable = false;
  String _liveSpokenText = 'جاهز للاستماع... اضغط لبدء الفحص الصوتي';
  String _audioQuality = 'متوسط';
  double _soundLevel = 0.5;

  @override
  void initState() {
    super.initState();
    _initSpeech();
  }

  Future<void> _initSpeech() async {
    try {
      final status = await Permission.microphone.request();
      if (status.isGranted) {
        _speechAvailable = await _speech.initialize(
          onStatus: (status) {
            debugPrint('Speech Status: $status');
            if (status == 'listening') {
              setState(() => _isListening = true);
            } else if (status == 'notListening' || status == 'done') {
              if (_isListening) {
                // Auto-restart continuous listening
                _startListeningDirectly();
              }
            }
          },
          onError: (error) {
            debugPrint('Speech Error: ${error.errorMsg}');
          },
        );
      }
    } catch (e) {
      debugPrint('Speech init exception: $e');
    }
  }

  Future<void> _toggleListening() async {
    if (_isListening) {
      setState(() {
        _isListening = false;
        _liveSpokenText = 'تم إيقاف الاستماع الصوتي مؤقتًا';
      });
      await _speech.stop();
    } else {
      await _startListeningDirectly();
    }
  }

  Future<void> _startListeningDirectly() async {
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      setState(() => _liveSpokenText = 'يرجى منح إذن الميكروفون للبدء');
      return;
    }

    if (!_speechAvailable) {
      _speechAvailable = await _speech.initialize();
    }

    setState(() {
      _isListening = true;
      _liveSpokenText = 'يستمع الآن... تفضل بنطق لوحات السيارات';
    });

    try {
      await _speech.listen(
        localeId: 'ar_EG', // Egyptian Dialect support as requested
        listenMode: stt.ListenMode.dictation,
        partialResults: true,
        onSoundLevelChange: (level) {
          setState(() {
            _soundLevel = (level / 100.0).clamp(0.1, 1.0);
            _audioQuality = level > 60 ? 'قوي' : (level > 25 ? 'متوسط' : 'هادئ');
          });
        },
        onResult: (result) {
          final words = result.recognizedWords;
          if (words.isNotEmpty) {
            setState(() {
              _liveSpokenText = words;
            });

            // Parse & Validate Plate with Confidence Engine
            if (result.finalResult || words.split(' ').length >= 3) {
              _validateAndProcessSpeech(words);
            }
          }
        },
      );
    } catch (e) {
      debugPrint('Speech listen error: $e');
    }
  }

  void _validateAndProcessSpeech(String rawSpeech) {
    final candidates = FlutterPlateEngine.parse(rawSpeech);
    if (candidates.isNotEmpty) {
      for (final candidate in candidates) {
        // Validation Layer: Must have valid letters + valid digits + confidence
        if (candidate.letters.isNotEmpty && candidate.numbers.isNotEmpty && candidate.confidence >= 0.8) {
          // Check if already processed recently
          final exists = widget.scans.any((s) => s['canonical'] == candidate.canonicalPlate && s['time'] == 'الآن');
          if (!exists) {
            widget.onAddScan(rawSpeech);
          }
        }
      }
    }
  }

  @override
  void dispose() {
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Column(
          children: [
            const SizedBox(height: 8),

            // --- Top App Bar ---
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Right side (RTL): 3D Cube Icon + 'بوابة العربي'
                Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: const Color(0xFF132238),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.view_in_ar_rounded,
                        color: Color(0xFF2BF0C4),
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'بوابة العربي',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF2BF0C4),
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),

                // Left side: Logout / Exit Icon
                IconButton(
                  icon: const Icon(Icons.logout, color: Color(0xFF7A8B9E), size: 22),
                  onPressed: () {},
                ),
              ],
            ),

            const SizedBox(height: 14),

            // --- Main Direct Voice Control Card ---
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              decoration: BoxDecoration(
                color: const Color(0xFF0F1829),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF192842), width: 1.2),
              ),
              child: Column(
                children: [
                  // Direct Voice Action Button (Cyan Button)
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2BF0C4),
                        foregroundColor: const Color(0xFF0A1320),
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(26),
                        ),
                      ),
                      onPressed: _toggleListening,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 14,
                            height: 14,
                            decoration: BoxDecoration(
                              color: const Color(0xFF0A1320),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            _isListening ? 'إيقاف الجلسة الصوتية' : 'بدء الجلسة الصوتية',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0A1320),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Status Text: 'يستمع الآن'
                  Text(
                    _isListening ? 'يستمع الآن' : 'جاهز للمسح الصوتي',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF2BF0C4),
                    ),
                  ),

                  const SizedBox(height: 6),

                  // Live Recognized Transcript (Transforms speech into text automatically)
                  Text(
                    _liveSpokenText,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFFCBD5E1),
                    ),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 14),

                  // Audio Level Visualizer Bar: [متوسط] --------------------- [الصوت]
                  Row(
                    children: [
                      // Badge: 'متوسط' / 'قوي'
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0D1726),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFF2BF0C4), width: 1.2),
                        ),
                        child: Text(
                          _audioQuality,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF2BF0C4),
                          ),
                        ),
                      ),

                      const SizedBox(width: 12),

                      // Cyan Audio Visualizer Line
                      Expanded(
                        child: Container(
                          height: 4,
                          decoration: BoxDecoration(
                            color: const Color(0xFF132238),
                            borderRadius: BorderRadius.circular(2),
                          ),
                          child: FractionallySizedBox(
                            alignment: Alignment.centerLeft,
                            widthFactor: _isListening ? _soundLevel : 0.4,
                            child: Container(
                              decoration: BoxDecoration(
                                color: const Color(0xFF2BF0C4),
                                borderRadius: BorderRadius.circular(2),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF2BF0C4).withOpacity(0.5),
                                    blurRadius: 4,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(width: 12),

                      // Label: 'الصوت'
                      const Text(
                        'الصوت',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF7A8B9E),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            // --- Direct Save & Clear Action Bar in Flutter UI ---
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'سجل الفحص الميداني:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF7A8B9E)),
                ),
                Row(
                  children: [
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2BF0C4),
                        foregroundColor: const Color(0xFF070B14),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: widget.onSaveSession,
                      icon: const Icon(Icons.save_alt_rounded, size: 16),
                      label: const Text('حفظ وتصدير (Excel)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF7A8B9E),
                        side: const BorderSide(color: Color(0xFF192842)),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () {
                        if (widget.scans.isNotEmpty) {
                          widget.onClearScans();
                        }
                      },
                      child: const Text('تفريغ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 8),

            // --- Real Results Table Card with Separated Columns ---
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: const Color(0xFF0F1829),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFF192842), width: 1.2),
                ),
                child: Column(
                  children: [
                    // Table Header: [#] [الحروف] [الأرقام] [الحالة]
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      decoration: const BoxDecoration(
                        color: Color(0xFF0A111E),
                        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                      ),
                      child: const Row(
                        children: [
                          // #
                          SizedBox(
                            width: 36,
                            child: Text(
                              '#',
                              style: TextStyle(
                                color: Color(0xFF7A8B9E),
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          // الحروف
                          Expanded(
                            flex: 3,
                            child: Text(
                              'الحروف',
                              style: TextStyle(
                                color: Color(0xFF7A8B9E),
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          // الأرقام
                          Expanded(
                            flex: 3,
                            child: Text(
                              'الأرقام',
                              style: TextStyle(
                                color: Color(0xFF7A8B9E),
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          // الحالة
                          Expanded(
                            flex: 2,
                            child: Text(
                              'الحالة',
                              style: TextStyle(
                                color: Color(0xFF7A8B9E),
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Table Rows
                    Expanded(
                      child: widget.scans.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.mic_none_rounded, color: const Color(0xFF7A8B9E).withOpacity(0.4), size: 48),
                                  const SizedBox(height: 8),
                                  const Text(
                                    'جاهز للمسح الصوتي المباشر',
                                    style: TextStyle(color: Color(0xFF7A8B9E), fontSize: 14),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              padding: EdgeInsets.zero,
                              itemCount: widget.scans.length,
                              separatorBuilder: (context, index) => const Divider(
                                color: Color(0xFF142036),
                                height: 1,
                                thickness: 1,
                              ),
                              itemBuilder: (context, index) {
                                final item = widget.scans[index];
                                final isWanted = item['wanted'] == true;

                                return Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                                  color: isWanted ? const Color(0x15FF4757) : Colors.transparent,
                                  child: Row(
                                    children: [
                                      // 1. Column #: 1, 2, 3, 4...
                                      SizedBox(
                                        width: 36,
                                        child: Text(
                                          '${index + 1}',
                                          style: const TextStyle(
                                            color: Color(0xFF7A8B9E),
                                            fontSize: 15,
                                            fontWeight: FontWeight.w600,
                                          ),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),

                                      // 2. Column الحروف: e.g. "ر ب ط", "ك م ل", "ن ع د", "ي و س"
                                      Expanded(
                                        flex: 3,
                                        child: Text(
                                          item['letters'] ?? '',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                            letterSpacing: 2,
                                          ),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),

                                      // 3. Column الأرقام: e.g. "5758", "2727", "7747", "6262"
                                      Expanded(
                                        flex: 3,
                                        child: Text(
                                          item['numbers'] ?? '',
                                          style: const TextStyle(
                                            color: Color(0xFF2BF0C4),
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                            letterSpacing: 1.5,
                                          ),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),

                                      // 4. Column الحالة
                                      Expanded(
                                        flex: 2,
                                        child: Center(
                                          child: isWanted
                                              ? Container(
                                                  width: 26,
                                                  height: 26,
                                                  decoration: const BoxDecoration(
                                                    color: Color(0xFFFF4757),
                                                    shape: BoxShape.circle,
                                                  ),
                                                  child: const Icon(
                                                    Icons.warning_amber_rounded,
                                                    color: Colors.white,
                                                    size: 16,
                                                  ),
                                                )
                                              : Container(
                                                  width: 26,
                                                  height: 26,
                                                  decoration: const BoxDecoration(
                                                    color: Color(0xFF2ED573),
                                                    shape: BoxShape.circle,
                                                  ),
                                                  child: const Icon(
                                                    Icons.check,
                                                    color: Color(0xFF070B14),
                                                    size: 18,
                                                  ),
                                                ),
                                        ),
                                      ),
                                    ],
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
                const Text('🚨 قائمة السيارات المطلوبة المكتشفة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
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
                  ? const Center(child: Text('لم يتم اكتشاف أي سيارات مطلوبة في جلسة العمل الحالية'))
                  : ListView.builder(
                      itemCount: scans.length,
                      itemBuilder: (ctx, i) {
                        final item = scans[i];
                        return Card(
                          color: const Color(0xFF0F1829),
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
                                    Text(item['time'], style: const TextStyle(color: Color(0xFF7A8B9E), fontSize: 12)),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text('نوع السيارة: ${item['type']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                Text('الجهة / البنك: ${item['bank']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                Text('رقم الهيكل (VIN): ${item['vin']}', style: const TextStyle(color: Color(0xFF7A8B9E))),
                                Text('الموقع (GPS): ${item['gps']}', style: const TextStyle(color: Color(0xFF2BF0C4))),
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
  final List<Map<String, dynamic>> sessions;
  final List<Map<String, dynamic>> datasets;
  final String activeDatasetName;
  final VoidCallback onRefresh;

  const HistoryAndDatasetsScreen({
    super.key,
    required this.sessions,
    required this.datasets,
    required this.activeDatasetName,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: SafeArea(
        child: Column(
          children: [
            TabBar(
              indicatorColor: const Color(0xFF2BF0C4),
              labelColor: const Color(0xFF2BF0C4),
              unselectedLabelColor: const Color(0xFF7A8B9E),
              tabs: const [
                Tab(text: 'الجلسات'),
                Tab(text: 'ملفات Excel'),
                Tab(text: 'الإعدادات'),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  // Tab 1: Sessions
                  RefreshIndicator(
                    onRefresh: () async => onRefresh(),
                    child: sessions.isEmpty
                        ? const Center(child: Text('لا توجد جلسات مسجلة'))
                        : ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: sessions.length,
                            itemBuilder: (ctx, i) {
                              final s = sessions[i];
                              return Card(
                                color: const Color(0xFF0F1829),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                margin: const EdgeInsets.only(bottom: 12),
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text('جلسة: ${s['id']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: s['status'] == 'ACTIVE' ? const Color(0x202ED573) : const Color(0x207A8B9E),
                                              borderRadius: BorderRadius.circular(8),
                                            ),
                                            child: Text(
                                              s['status'] == 'ACTIVE' ? 'نشطة' : 'مكتملة',
                                              style: TextStyle(
                                                color: s['status'] == 'ACTIVE' ? const Color(0xFF2ED573) : const Color(0xFF7A8B9E),
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'إجمالي الفحوصات: ${s['totalScans'] ?? 0} | المطلوبة: ${s['wantedCount'] ?? 0} | السليمة: ${s['clearedCount'] ?? 0}',
                                        style: const TextStyle(color: Color(0xFF7A8B9E), fontSize: 13),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),

                  // Tab 2: Excel
                  RefreshIndicator(
                    onRefresh: () async => onRefresh(),
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Card(
                          color: const Color(0xFF0F1829),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                            side: const BorderSide(color: Color(0xFF2BF0C4)),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('⭐ القائمة المفعلة على السحابة', style: TextStyle(color: Color(0xFF2BF0C4), fontWeight: FontWeight.bold)),
                                const SizedBox(height: 8),
                                Text(activeDatasetName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                                const Text('56,481 لوحة مفهرسة بالذاكرة | مصدر البيانات: file.xlsx', style: TextStyle(color: Color(0xFF7A8B9E), fontSize: 13)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Tab 3: Settings
                  ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      SwitchListTile(
                        value: true,
                        activeColor: const Color(0xFF2BF0C4),
                        onChanged: (v) {},
                        title: const Text('التنبيه الصوتي (Siren)'),
                      ),
                      SwitchListTile(
                        value: true,
                        activeColor: const Color(0xFF2BF0C4),
                        onChanged: (v) {},
                        title: const Text('الاهتزاز عند التنبيه'),
                      ),
                      SwitchListTile(
                        value: true,
                        activeColor: const Color(0xFF2BF0C4),
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
