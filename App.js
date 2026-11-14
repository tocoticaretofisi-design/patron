import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  Switch,
  Platform,
  Animated,
} from 'react-native';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Polygon, Line } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// GERÇEK BULUT BAĞLANTISI (FIREBASE) YAPILANDIRMASI
// ============================================================================
const FIREBASE_CONFIG = {
  apiKey: "", 
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const IS_LIVE_FIREBASE = FIREBASE_CONFIG.apiKey.trim().length > 0;

const CloudService = {
  async saveUserData(email, data) {
    const key = `@patron_cloud_${email.toLowerCase().trim()}`;
    await AsyncStorage.setItem(key, JSON.stringify(data));
    if (IS_LIVE_FIREBASE) {
      try {
        await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users/${encodeURIComponent(email)}?key=${FIREBASE_CONFIG.apiKey}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                payload: { stringValue: JSON.stringify(data) },
                updatedAt: { stringValue: new Date().toISOString() }
              }
            })
          }
        );
      } catch (e) {
        console.log('Bulut senkronizasyon beklemede:', e);
      }
    }
  },

  async loadUserData(email) {
    const key = `@patron_cloud_${email.toLowerCase().trim()}`;
    if (IS_LIVE_FIREBASE) {
      try {
        const res = await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users/${encodeURIComponent(email)}?key=${FIREBASE_CONFIG.apiKey}`
        );
        const json = await res.json();
        if (json?.fields?.payload?.stringValue) {
          return JSON.parse(json.fields.payload.stringValue);
        }
      } catch (e) {
        console.log('Yerel önbellekten yükleniyor...');
      }
    }
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },

  async authenticateUser(email, password, isLogin) {
    const cleanEmail = email.toLowerCase().trim();
    const authKey = `@patron_auth_${cleanEmail}`;

    if (IS_LIVE_FIREBASE) {
      const endpoint = isLogin
        ? `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`
        : `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true }),
      });
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || 'Bulut kimlik doğrulama hatası');
      }
      return cleanEmail;
    }

    const existing = await AsyncStorage.getItem(authKey);
    if (isLogin) {
      if (!existing) {
        await AsyncStorage.setItem(authKey, JSON.stringify({ password }));
        return cleanEmail;
      }
      const parsed = JSON.parse(existing);
      if (parsed.password !== password) {
        throw new Error('Şifre hatalı. Lütfen kontrol edin.');
      }
      return cleanEmail;
    } else {
      if (existing) {
        throw new Error('Bu e-posta adresi zaten kayıtlı. Giriş yapabilirsiniz.');
      }
      await AsyncStorage.setItem(authKey, JSON.stringify({ password }));
      return cleanEmail;
    }
  }
};

// --- GİRİŞ / ÜYE OLMA EKRANI ---
function AuthScreen({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@patron_remembered_email');
        const savedPass = await AsyncStorage.getItem('@patron_remembered_pass');
        if (savedEmail) {
          setEmail(savedEmail);
          if (savedPass) setPassword(savedPass);
        }
      } catch (e) {
        console.log('Hatırla verisi okunamadı');
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!email.includes('@') || password.length < 4) {
      Alert.alert('Eksik veya Hatalı Bilgi', 'Lütfen geçerli bir e-posta ve en az 4 haneli şifre girin.');
      return;
    }
    setLoading(true);
    try {
      const authenticatedEmail = await CloudService.authenticateUser(email, password, isLogin);
      
      if (rememberMe) {
        await AsyncStorage.setItem('@patron_remembered_email', authenticatedEmail);
        await AsyncStorage.setItem('@patron_remembered_pass', password);
      } else {
        await AsyncStorage.removeItem('@patron_remembered_email');
        await AsyncStorage.removeItem('@patron_remembered_pass');
      }

      onLoginSuccess(authenticatedEmail);
    } catch (err) {
      Alert.alert('Giriş Başarısız', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    const savedEmail = await AsyncStorage.getItem('@patron_remembered_email');
    const savedPass = await AsyncStorage.getItem('@patron_remembered_pass');
    
    if (!savedEmail || !savedPass) {
      Alert.alert('Biyometrik Kayıt Bulunamadı', 'Önce şifrenizle bir kez giriş yapıp "Beni Hatırla" seçeneğini aktif etmelisiniz.');
      return;
    }

    setLoading(true);
    setTimeout(async () => {
      try {
        const authenticatedEmail = await CloudService.authenticateUser(savedEmail, savedPass, true);
        setLoading(false);
        onLoginSuccess(authenticatedEmail);
      } catch (e) {
        setLoading(false);
        Alert.alert('Parmak İzi Doğrulanamadı', 'Kayıtlı bilgiler doğrulanamadı.');
      }
    }, 800);
  };

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <View style={styles.authContainer}>
        <View style={styles.authHeader}>
          <Text style={styles.headerSubtitle}>PATRON YÖNETİM SİSTEMİ</Text>
          <View style={styles.patronBox}>
            <Text style={styles.patronBoxText}>PATRON</Text>
          </View>
          <Text style={styles.authTitle}>{isLogin ? 'Hesabınıza Giriş Yapın' : 'Bulut Hesabı Oluşturun'}</Text>
          <Text style={styles.authSubtitleText}>TOCO Ticaret Ofisi Güvenli Altyapı</Text>
        </View>

        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="E-posta Adresi"
            placeholderTextColor="#71717a"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Şifre (En az 4 karakter)"
            placeholderTextColor="#71717a"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <View style={styles.rememberRow}>
            <Text style={styles.rememberText}>Beni Hatırla</Text>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: '#27272a', true: '#882222' }}
              thumbColor={rememberMe ? '#ffffff' : '#71717a'}
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>{isLogin ? 'Giriş Yap' : 'Kayıt Ol ve Bağlan'}</Text>
            )}
          </TouchableOpacity>

          {isLogin && (
            <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricLogin}>
              <Text style={styles.biometricButtonText}>🔓 Parmak İzi / Biyometrik ile Gir</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.switchButton} onPress={() => setIsLogin(!isLogin)}>
            <Text style={styles.switchButtonText}>
              {isLogin ? 'Hesabınız yok mu? Yeni Üyelik Oluşturun' : 'Zaten hesabınız var mı? Giriş yapın'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerBranding}>
          <Text style={styles.footerText}>Bu uygulama</Text>
          <Text style={styles.footerBrandHighlight}>TOCO Ticaret Ofisi</Text>
          <Text style={styles.footerText}>tarafından geliştirilmiştir.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// --- MODERN LINEAR KÂR / ZARAR GRAFİĞİ ---
function ProfitLossLinearChart({ monthlyData }) {
  const width = 310;
  const height = 130;
  const padding = 20;

  const values = monthlyData.map((d) => d.net);
  const maxVal = Math.max(...values, 10000);
  const minVal = Math.min(...values, -5000);
  const range = maxVal - minVal || 1;

  const points = monthlyData.map((item, index) => {
    const x = padding + (index * (width - padding * 2)) / (monthlyData.length - 1 || 1);
    const y = height - padding - ((item.net - minVal) / range) * (height - padding * 2);
    return { x, y, ...item };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${points[0].x},${height - padding} ${polylinePoints} ${points[points.length - 1].x},${height - padding}`;
  const zeroY = height - padding - ((0 - minVal) / range) * (height - padding * 2);

  const latestNet = monthlyData[monthlyData.length - 1]?.net || 0;
  const isPositive = latestNet >= 0;

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartTitle}>Aylık Kâr / Zarar Trendi</Text>
          <Text style={styles.chartSub}>Son 6 Aylık Net Performans</Text>
        </View>
        <View style={[styles.trendBadge, { backgroundColor: isPositive ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)' }]}>
          <Text style={[styles.trendBadgeText, { color: isPositive ? '#4ade80' : '#f87171' }]}>
            {isPositive ? `+₺${latestNet.toLocaleString('tr-TR')}` : `-₺${Math.abs(latestNet).toLocaleString('tr-TR')}`}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', marginVertical: 5 }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#38bdf8" stopOpacity="0.4" />
              <Stop offset="1" stopColor="#38bdf8" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          <Line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#3f3f46" strokeDasharray="4 4" strokeWidth="1" />
          <Polygon points={areaPoints} fill="url(#grad)" />
          <Polyline fill="none" stroke="#38bdf8" strokeWidth="3" points={polylinePoints} />

          {points.map((p, idx) => (
            <Circle key={idx} cx={p.x} cy={p.y} r="4.5" fill={p.net >= 0 ? '#4ade80' : '#ef4444'} stroke="#121212" strokeWidth="1.5" />
          ))}
        </Svg>
      </View>

      <View style={styles.chartMonthsRow}>
        {monthlyData.map((m, i) => (
          <Text key={i} style={styles.chartMonthLabel}>{m.month}</Text>
        ))}
      </View>
    </View>
  );
}

// --- ANASAYFA BİLEŞENİ ---
function HomeScreen({ navigation, userEmail, totalCash, totalAvailable, upcomingCreditsCount, syncStatus, onScroll }) {
  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hoş Geldiniz, {userEmail}</Text>
        <Text style={styles.title}>Patron Yönetim</Text>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mevcut Nakit</Text>
          <Text style={[styles.cardValue, { color: '#4ade80' }]}>₺{totalCash.toLocaleString('tr-TR')}</Text>
          <Text style={styles.cardHint}>Ek Hesap Dahil: ₺{totalAvailable.toLocaleString('tr-TR')}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Yaklaşan Kredi</Text>
          <Text style={[styles.cardValue, { color: upcomingCreditsCount > 0 ? '#f87171' : '#ffffff' }]}>
            {upcomingCreditsCount} Adet
          </Text>
          <Text style={styles.cardHint}>7 gün içindeki ödemeler</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation('Finans')}>
          <Text style={styles.buttonText}>💳 Finans, Alacaklılar & Kredi Yönetimi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { marginTop: 10, backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#38bdf8' }]} onPress={() => navigation('Portfoy')}>
          <Text style={[styles.buttonText, { color: '#38bdf8' }]}>🏢 Gayrimenkul Portföy & Talep Listesi</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cloudBadge}>
        <Text style={styles.cloudBadgeText}>☁️ {syncStatus}</Text>
      </View>
    </ScrollView>
  );
}

// --- FİNANS EKRANI ---
function FinanceScreen({
  accounts,
  setAccounts,
  credits,
  setCredits,
  transactions,
  setTransactions,
  creditors,
  setCreditors,
  onScroll,
}) {
  const [subTab, setSubTab] = useState('Genel');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');

  const [showTxModal, setShowTxModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showCreditorModal, setShowCreditorModal] = useState(false);

  const [editingTxId, setEditingTxId] = useState(null);
  const [editingBankId, setEditingBankId] = useState(null);
  const [editingCreditId, setEditingCreditId] = useState(null);
  const [editingCreditorId, setEditingCreditorId] = useState(null);

  const [txType, setTxType] = useState('gelir');
  const [txTitle, setTxTitle] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [txAmount, setTxAmount] = useState('');

  const [bankName, setBankName] = useState('');
  const [bankCash, setBankCash] = useState('');
  const [bankOverdraft, setBankOverdraft] = useState('');

  const [creditName, setCreditName] = useState('');
  const [totalInstallments, setTotalInstallments] = useState('');
  const [currentInstallment, setCurrentInstallment] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [paymentDay, setPaymentDay] = useState('');

  const [creditorName, setCreditorName] = useState('');
  const [creditorPhone, setCreditorPhone] = useState('');
  const [creditorAmount, setCreditorAmount] = useState('');

  const totalCash = accounts.reduce((sum, a) => sum + a.cash, 0);
  const totalOverdraft = accounts.reduce((sum, a) => sum + a.overdraft, 0);
  const totalAvailable = totalCash + totalOverdraft;
  const totalCreditorsAmount = creditors.reduce((sum, c) => sum + c.amount, 0);

  const dynamicCategories = useMemo(() => {
    const cats = new Set(['Tümü']);
    transactions.forEach((t) => {
      if (t.category && t.category.trim() !== '') {
        cats.add(t.category.trim());
      }
    });
    return Array.from(cats);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (selectedCategory === 'Tümü') return transactions;
    return transactions.filter((t) => t.category.toLowerCase() === selectedCategory.toLowerCase());
  }, [transactions, selectedCategory]);

  const currentMonthNet = transactions.reduce(
    (acc, t) => (t.type === 'gelir' ? acc + t.amount : acc - t.amount),
    0
  );

  const monthlyChartData = [
    { month: 'Haz', net: 18500 },
    { month: 'Tem', net: 24200 },
    { month: 'Ağu', net: -6400 },
    { month: 'Eyl', net: 31000 },
    { month: 'Eki', net: 27800 },
    { month: 'Kas', net: currentMonthNet },
  ];

  const todayDay = new Date().getDate();
  const getDaysLeft = (day) => {
    let diff = day - todayDay;
    if (diff < 0) diff += 30;
    return diff;
  };

  const upcomingAlerts = credits.filter((c) => getDaysLeft(c.paymentDay) <= 7);

  const handleDeleteBank = (id, name) => {
    Alert.alert('Hesabı Sil', `"${name}" hesabını silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setAccounts(accounts.filter((a) => a.id !== id)) },
    ]);
  };

  const handleDeleteCredit = (id, name) => {
    Alert.alert('Krediyi Sil', `"${name}" kaydını silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setCredits(credits.filter((c) => c.id !== id)) },
    ]);
  };

  const handleDeleteCreditor = (id, name) => {
    Alert.alert('Alacaklıyı Sil', `"${name}" kaydını silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setCreditors(creditors.filter((c) => c.id !== id)) },
    ]);
  };

  const handleDeleteTransaction = (id, title) => {
    Alert.alert('İşlemi Sil', `"${title}" hareketini silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setTransactions(transactions.filter((t) => t.id !== id)) },
    ]);
  };

  const openNewBankModal = () => { setEditingBankId(null); setBankName(''); setBankCash(''); setBankOverdraft(''); setShowBankModal(true); };
  const openEditBankModal = (acc) => { setEditingBankId(acc.id); setBankName(acc.name); setBankCash(String(acc.cash)); setBankOverdraft(String(acc.overdraft)); setShowBankModal(true); };

  const openNewCreditModal = () => { setEditingCreditId(null); setCreditName(''); setTotalInstallments(''); setCurrentInstallment(''); setInstallmentAmount(''); setPaymentDay(''); setShowCreditModal(true); };
  const openEditCreditModal = (credit) => { setEditingCreditId(credit.id); setCreditName(credit.name); setTotalInstallments(String(credit.totalInstallments)); setCurrentInstallment(String(credit.currentInstallment)); setInstallmentAmount(String(credit.amount)); setPaymentDay(String(credit.paymentDay)); setShowCreditModal(true); };

  const openNewCreditorModal = () => { setEditingCreditorId(null); setCreditorName(''); setCreditorPhone(''); setCreditorAmount(''); setShowCreditorModal(true); };
  const openEditCreditorModal = (cred) => { setEditingCreditorId(cred.id); setCreditorName(cred.name); setCreditorPhone(cred.phone); setCreditorAmount(String(cred.amount)); setShowCreditorModal(true); };

  const openNewTxModal = () => { setEditingTxId(null); setTxType('gelir'); setTxTitle(''); setTxCategory(''); setTxAmount(''); setShowTxModal(true); };
  const openEditTxModal = (tx) => { setEditingTxId(tx.id); setTxType(tx.type); setTxTitle(tx.title); setTxCategory(tx.category); setTxAmount(String(tx.amount)); setShowTxModal(true); };

  const handleSaveBank = () => {
    const cashNum = parseFloat(bankCash) || 0;
    const overdraftNum = parseFloat(bankOverdraft) || 0;
    if (!bankName) { Alert.alert('Hata', 'Lütfen banka adını girin.'); return; }
    if (editingBankId) {
      setAccounts(accounts.map((a) => (a.id === editingBankId ? { ...a, name: bankName.trim(), cash: cashNum, overdraft: overdraftNum } : a)));
    } else {
      setAccounts([...accounts, { id: Date.now().toString(), name: bankName.trim(), cash: cashNum, overdraft: overdraftNum }]);
    }
    setShowBankModal(false);
  };

  const handleSaveCredit = () => {
    const totInst = parseInt(totalInstallments, 10);
    const curInst = parseInt(currentInstallment, 10);
    const instAmt = parseFloat(installmentAmount);
    const pDay = parseInt(paymentDay, 10);
    if (!creditName || isNaN(totInst) || isNaN(curInst) || isNaN(instAmt) || isNaN(pDay) || pDay < 1 || pDay > 31) {
      Alert.alert('Hata', 'Lütfen tüm kredi bilgilerini eksiksiz girin.');
      return;
    }
    if (editingCreditId) {
      setCredits(credits.map((c) => (c.id === editingCreditId ? { ...c, name: creditName.trim(), totalInstallments: totInst, currentInstallment: curInst, amount: instAmt, paymentDay: pDay } : c)));
    } else {
      setCredits([...credits, { id: Date.now().toString(), name: creditName.trim(), totalInstallments: totInst, currentInstallment: curInst, amount: instAmt, paymentDay: pDay }]);
    }
    setShowCreditModal(false);
  };

  const handleSaveCreditor = () => {
    const amtNum = parseFloat(creditorAmount);
    if (!creditorName || !creditorPhone || isNaN(amtNum)) {
      Alert.alert('Hata', 'Lütfen isim soyisim, telefon numarası ve meblağ girin.');
      return;
    }
    if (editingCreditorId) {
      setCreditors(creditors.map((c) => (c.id === editingCreditorId ? { ...c, name: creditorName.trim(), phone: creditorPhone.trim(), amount: amtNum } : c)));
    } else {
      setCreditors([...creditors, { id: Date.now().toString(), name: creditorName.trim(), phone: creditorPhone.trim(), amount: amtNum }]);
    }
    setShowCreditorModal(false);
  };

  const handleSaveTransaction = () => {
    const amountNum = parseFloat(txAmount);
    if (!txTitle || !txCategory || isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Hata', 'Lütfen açıklama, tür ve geçerli tutar girin.');
      return;
    }
    if (editingTxId) {
      setTransactions(transactions.map((t) => (t.id === editingTxId ? { ...t, type: txType, title: txTitle.trim(), category: txCategory.trim(), amount: amountNum } : t)));
    } else {
      setTransactions([{ id: Date.now().toString(), type: txType, title: txTitle.trim(), category: txCategory.trim(), amount: amountNum, date: new Date().toLocaleDateString('tr-TR') }, ...transactions]);
    }
    setShowTxModal(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.financeTopBar}>
        <View>
          <Text style={styles.title}>Finans & Alacaklar</Text>
          <Text style={styles.subtitle}>Nakit, Kredi & Alacaklı Takibi</Text>
        </View>
        <TouchableOpacity style={styles.quickAddBtn} onPress={openNewTxModal}>
          <Text style={styles.quickAddBtnText}>+ İşlem</Text>
        </TouchableOpacity>
      </View>

      {upcomingAlerts.length > 0 && (
        <View style={styles.notificationBanner}>
          <Text style={styles.notificationTitle}>🔔 YAKLAŞAN KREDİ ÖDEME BİLDİRİMİ</Text>
          {upcomingAlerts.map((c) => {
            const left = getDaysLeft(c.paymentDay);
            return (
              <Text key={c.id} style={styles.notificationText}>
                • {c.name}: <Text style={{ fontWeight: 'bold', color: '#ffffff' }}>₺{c.amount.toLocaleString('tr-TR')}</Text> ({left === 0 ? 'BUGÜN!' : `${left} gün kaldı`})
              </Text>
            );
          })}
        </View>
      )}

      <View style={styles.subTabRow}>
        {['Genel', 'Bankalar', 'Krediler', 'Alacaklılar', 'Hareketler'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.subTabBtn, subTab === tab && styles.subTabBtnActive]}
            onPress={() => setSubTab(tab)}
          >
            <Text style={[styles.subTabText, subTab === tab && styles.subTabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 100 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {subTab === 'Genel' && (
          <>
            <ProfitLossLinearChart monthlyData={monthlyChartData} />

            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Mevcut Nakit</Text>
                <Text style={[styles.summaryAmount, { color: '#4ade80' }]}>₺{totalCash.toLocaleString('tr-TR')}</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Toplam Alacaklar</Text>
                <Text style={[styles.summaryAmount, { color: '#facc15' }]}>₺{totalCreditorsAmount.toLocaleString('tr-TR')}</Text>
              </View>
            </View>

            <View style={styles.totalPowerCard}>
              <Text style={styles.totalPowerLabel}>Toplam Kullanılabilir Nakit Gücü</Text>
              <Text style={styles.totalPowerValue}>₺{totalAvailable.toLocaleString('tr-TR')}</Text>
            </View>

            <View style={styles.quickActionRow}>
              <TouchableOpacity style={styles.miniActionBtn} onPress={openNewBankModal}>
                <Text style={styles.miniActionText}>🏦 + Banka Ekle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.miniActionBtn} onPress={openNewCreditorModal}>
                <Text style={styles.miniActionText}>👤 + Alacaklı Ekle</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {(subTab === 'Genel' || subTab === 'Bankalar') && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>🏦 Banka Hesapları & KMH</Text>
              <TouchableOpacity onPress={openNewBankModal}><Text style={styles.linkText}>+ Yeni Ekle</Text></TouchableOpacity>
            </View>
            {accounts.map((acc) => (
              <View key={acc.id} style={styles.bankCard}>
                <View style={styles.bankCardTop}>
                  <Text style={styles.bankName}>{acc.name}</Text>
                  <View style={styles.iconActionsRow}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEditBankModal(acc)}><Text style={styles.iconBtnText}>✏️</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteBank(acc.id, acc.name)}><Text style={styles.iconBtnText}>🗑️</Text></TouchableOpacity>
                  </View>
                </View>
                <View style={styles.bankDetailsRow}>
                  <View><Text style={styles.bankDetailLabel}>Nakit</Text><Text style={[styles.bankDetailValue, { color: '#4ade80' }]}>₺{acc.cash.toLocaleString('tr-TR')}</Text></View>
                  <View><Text style={styles.bankDetailLabel}>KMH</Text><Text style={[styles.bankDetailValue, { color: '#38bdf8' }]}>₺{acc.overdraft.toLocaleString('tr-TR')}</Text></View>
                  <View style={{ alignItems: 'flex-end' }}><Text style={styles.bankDetailLabel}>Toplam</Text><Text style={[styles.bankDetailValue, { color: '#ffffff' }]}>₺{(acc.cash + acc.overdraft).toLocaleString('tr-TR')}</Text></View>
                </View>
              </View>
            ))}
          </View>
        )}

        {(subTab === 'Genel' || subTab === 'Krediler') && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>📅 Kredi & Taksit Takibi</Text>
              <TouchableOpacity onPress={openNewCreditModal}><Text style={styles.linkText}>+ Kredi Ekle</Text></TouchableOpacity>
            </View>
            {credits.map((credit) => {
              const daysLeft = getDaysLeft(credit.paymentDay);
              const progressPercent = Math.min(100, Math.round((credit.currentInstallment / credit.totalInstallments) * 100));
              return (
                <View key={credit.id} style={styles.creditCard}>
                  <View style={styles.creditTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.creditTitle}>{credit.name}</Text>
                      <Text style={styles.creditSub}>Ödeme Günü: Her ayın {credit.paymentDay}'i ({daysLeft === 0 ? 'Bugün!' : `${daysLeft} gün kaldı`})</Text>
                    </View>
                    <View style={styles.iconActionsRow}>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => openEditCreditModal(credit)}><Text style={styles.iconBtnText}>✏️</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteCredit(credit.id, credit.name)}><Text style={styles.iconBtnText}>🗑️</Text></TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.progressBg}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>
                  <View style={styles.creditBottomRow}>
                    <View style={styles.installmentPill}><Text style={styles.installmentPillText}>{credit.currentInstallment} / {credit.totalInstallments}. Taksit</Text></View>
                    <Text style={styles.creditAmountValue}>₺{credit.amount.toLocaleString('tr-TR')}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {(subTab === 'Genel' || subTab === 'Alacaklılar') && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>👤 Alacaklılar & Borçlular Listesi</Text>
              <TouchableOpacity onPress={openNewCreditorModal}><Text style={styles.linkText}>+ Alacaklı Ekle</Text></TouchableOpacity>
            </View>

            {creditors.length === 0 && <Text style={styles.emptyText}>Henüz alacaklı kaydı eklenmedi.</Text>}

            {creditors.map((cred) => (
              <View key={cred.id} style={styles.bankCard}>
                <View style={styles.bankCardTop}>
                  <View>
                    <Text style={styles.bankName}>{cred.name}</Text>
                    <Text style={styles.creditSub}>📞 {cred.phone}</Text>
                  </View>
                  <View style={styles.iconActionsRow}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEditCreditorModal(cred)}><Text style={styles.iconBtnText}>✏️</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteCreditor(cred.id, cred.name)}><Text style={styles.iconBtnText}>🗑️</Text></TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.bankDetailsRow, { justifyContent: 'flex-end' }]}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.bankDetailLabel}>Alacak Meblağı</Text>
                    <Text style={[styles.bankDetailValue, { color: '#facc15', fontSize: 16 }]}>₺{cred.amount.toLocaleString('tr-TR')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {(subTab === 'Genel' || subTab === 'Hareketler') && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>📊 Gelir & Gider Hareketleri</Text>
              <TouchableOpacity onPress={openNewTxModal}><Text style={styles.linkText}>+ İşlem Ekle</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {dynamicCategories.map((cat) => (
                <TouchableOpacity key={cat} style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]} onPress={() => setSelectedCategory(cat)}>
                  <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {filteredTransactions.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle}>{tx.title}</Text>
                  <View style={styles.txMetaRow}>
                    <View style={styles.txCatBadge}><Text style={styles.txCatText}>{tx.category}</Text></View>
                    <Text style={styles.txDate}>{tx.date}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.txAmount, { color: tx.type === 'gelir' ? '#4ade80' : '#f87171' }]}>{tx.type === 'gelir' ? '+' : '-'}₺{tx.amount.toLocaleString('tr-TR')}</Text>
                  <View style={[styles.iconActionsRow, { marginTop: 4 }]}>
                    <TouchableOpacity style={styles.miniIconBtn} onPress={() => openEditTxModal(tx)}><Text style={styles.miniIconText}>✏️</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.miniIconBtn} onPress={() => handleDeleteTransaction(tx.id, tx.title)}><Text style={styles.miniIconText}>🗑️</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modals for Finance */}
      <Modal visible={showTxModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Gelir / Gider İşlemi</Text>
            <View style={styles.typeSwitchRow}>
              <TouchableOpacity style={[styles.typeBtn, txType === 'gelir' && styles.typeBtnGelir]} onPress={() => setTxType('gelir')}><Text style={styles.typeBtnText}>+ Gelir</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, txType === 'gider' && styles.typeBtnGider]} onPress={() => setTxType('gider')}><Text style={styles.typeBtnText}>- Gider</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Açıklama" placeholderTextColor="#71717a" value={txTitle} onChangeText={setTxTitle} />
            <TextInput style={styles.input} placeholder="Tür (Kira, Komisyon vb.)" placeholderTextColor="#71717a" value={txCategory} onChangeText={setTxCategory} />
            <TextInput style={styles.input} placeholder="Tutar (TL)" placeholderTextColor="#71717a" keyboardType="numeric" value={txAmount} onChangeText={setTxAmount} />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTxModal(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTransaction}><Text style={styles.saveBtnText}>Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showBankModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Banka Hesabı</Text>
            <TextInput style={styles.input} placeholder="Banka Adı" placeholderTextColor="#71717a" value={bankName} onChangeText={setBankName} />
            <TextInput style={styles.input} placeholder="Nakit Bakiye" placeholderTextColor="#71717a" keyboardType="numeric" value={bankCash} onChangeText={setBankCash} />
            <TextInput style={styles.input} placeholder="Ek Hesap / KMH" placeholderTextColor="#71717a" keyboardType="numeric" value={bankOverdraft} onChangeText={setBankOverdraft} />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowBankModal(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveBank}><Text style={styles.saveBtnText}>Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Kredi Bilgisi</Text>
            <TextInput style={styles.input} placeholder="Kredi Adı" placeholderTextColor="#71717a" value={creditName} onChangeText={setCreditName} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TextInput style={[styles.input, { width: '48%' }]} placeholder="Kaçıncı Taksit" placeholderTextColor="#71717a" keyboardType="numeric" value={currentInstallment} onChangeText={setCurrentInstallment} />
              <TextInput style={[styles.input, { width: '48%' }]} placeholder="Toplam Taksit" placeholderTextColor="#71717a" keyboardType="numeric" value={totalInstallments} onChangeText={setTotalInstallments} />
            </View>
            <TextInput style={styles.input} placeholder="Aylık Tutar" placeholderTextColor="#71717a" keyboardType="numeric" value={installmentAmount} onChangeText={setInstallmentAmount} />
            <TextInput style={styles.input} placeholder="Ödeme Günü (1-31)" placeholderTextColor="#71717a" keyboardType="numeric" value={paymentDay} onChangeText={setPaymentDay} />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreditModal(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCredit}><Text style={styles.saveBtnText}>Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreditorModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Alacaklı / Borçlu Ekle</Text>
            <TextInput style={styles.input} placeholder="Ad Soyad / Firma" placeholderTextColor="#71717a" value={creditorName} onChangeText={setCreditorName} />
            <TextInput style={styles.input} placeholder="Telefon Numarası" placeholderTextColor="#71717a" keyboardType="phone-pad" value={creditorPhone} onChangeText={setCreditorPhone} />
            <TextInput style={styles.input} placeholder="Meblağ (TL)" placeholderTextColor="#71717a" keyboardType="numeric" value={creditorAmount} onChangeText={setCreditorAmount} />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreditorModal(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCreditor}><Text style={styles.saveBtnText}>Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- PORTFÖYLER & TALEP LİSTESİ EKRANI ---
function PortfolioScreen({ portfolios, setPortfolios, demands, setDemands, onScroll }) {
  const [activeTab, setActiveTab] = useState('Portfoyler');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('Tümü');

  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [showDemandModal, setShowDemandModal] = useState(false);

  const [editingPortfolioId, setEditingPortfolioId] = useState(null);
  const [editingDemandId, setEditingDemandId] = useState(null);

  const [pTitle, setPTitle] = useState('');
  const [pType, setPType] = useState('Konut');
  const [pIsland, setPIsland] = useState('');
  const [pParcel, setPParcel] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pDetails, setPDetails] = useState('');

  const [dName, setDName] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dRequest, setDRequest] = useState('');

  const propertyTypes = ['Tümü', 'Tarla', 'Zeytinlik', 'Arsa', 'Bahçe', 'Konut'];

  const filteredPortfolios = useMemo(() => {
    if (selectedTypeFilter === 'Tümü') return portfolios;
    return portfolios.filter((p) => p.type === selectedTypeFilter);
  }, [portfolios, selectedTypeFilter]);

  const handleDeletePortfolio = (id, title) => {
    Alert.alert('Portföyü Sil', `"${title}" mülkünü silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setPortfolios(portfolios.filter((p) => p.id !== id)) },
    ]);
  };

  const handleDeleteDemand = (id, name) => {
    Alert.alert('Talebi Sil', `"${name}" talep kaydını silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setDemands(demands.filter((d) => d.id !== id)) },
    ]);
  };

  const openNewPortfolioModal = () => {
    setEditingPortfolioId(null);
    setPTitle('');
    setPType('Konut');
    setPIsland('');
    setPParcel('');
    setPPrice('');
    setPDetails('');
    setShowPortfolioModal(true);
  };

  const openEditPortfolioModal = (item) => {
    setEditingPortfolioId(item.id);
    setPTitle(item.title);
    setPType(item.type);
    setPIsland(item.island || '');
    setPParcel(item.parcel || '');
    setPPrice(String(item.price));
    setPDetails(item.details || '');
    setShowPortfolioModal(true);
  };

  const openNewDemandModal = () => {
    setEditingDemandId(null);
    setDName('');
    setDPhone('');
    setDRequest('');
    setShowDemandModal(true);
  };

  const openEditDemandModal = (item) => {
    setEditingDemandId(item.id);
    setDName(item.name);
    setDPhone(item.phone);
    setDRequest(item.request);
    setShowDemandModal(true);
  };

  const handleSavePortfolio = () => {
    const priceNum = parseFloat(pPrice) || 0;
    if (!pTitle || isNaN(priceNum)) {
      Alert.alert('Hata', 'Lütfen mülk adı ve geçerli fiyat girin.');
      return;
    }

    const newPortfolioItem = {
      id: editingPortfolioId || Date.now().toString(),
      title: pTitle.trim(),
      type: pType,
      island: pIsland.trim(),
      parcel: pParcel.trim(),
      price: priceNum,
      details: pDetails.trim(),
    };

    if (editingPortfolioId) {
      setPortfolios(portfolios.map((p) => (p.id === editingPortfolioId ? newPortfolioItem : p)));
    } else {
      setPortfolios([newPortfolioItem, ...portfolios]);

      const matchingDemands = demands.filter((d) => {
        const reqLower = d.request.toLowerCase();
        const typeLower = pType.toLowerCase();
        const titleLower = pTitle.trim().toLowerCase();
        return reqLower.includes(typeLower) || reqLower.includes(titleLower) || (pIsland && reqLower.includes(pIsland));
      });

      if (matchingDemands.length > 0) {
        const matchedNames = matchingDemands.map((m) => `${m.name} (${m.phone})`).join('\n• ');
        setTimeout(() => {
          Alert.alert(
            '🎯 MÜŞTERİ TALEBİ İLE EŞLEŞTİ!',
            `Eklediğiniz yeni portföy ("${pTitle}") şu alıcı talepleriyle eşleşti:\n\n• ${matchedNames}`,
            [{ text: 'Harika, Listeye Git' }]
          );
        }, 500);
      }
    }

    setShowPortfolioModal(false);
  };

  const handleSaveDemand = () => {
    if (!dName || !dPhone || !dRequest) {
      Alert.alert('Hata', 'Lütfen isim soyisim, cep telefonu ve talep detaylarını doldurun.');
      return;
    }

    const newDemandItem = {
      id: editingDemandId || Date.now().toString(),
      name: dName.trim(),
      phone: dPhone.trim(),
      request: dRequest.trim(),
    };

    if (editingDemandId) {
      setDemands(demands.map((d) => (d.id === editingDemandId ? newDemandItem : d)));
    } else {
      setDemands([newDemandItem, ...demands]);

      const matchingPortfolios = portfolios.filter((p) => {
        const reqLower = dRequest.toLowerCase();
        return reqLower.includes(p.type.toLowerCase()) || reqLower.includes(p.title.toLowerCase()) || (p.island && reqLower.includes(p.island));
      });

      if (matchingPortfolios.length > 0) {
        const matchedTitles = matchingPortfolios.map((mp) => `• ${mp.title} (${mp.type})`).join('\n');
        setTimeout(() => {
          Alert.alert(
            '🎯 PORTFÖY İLE EŞLEŞTİ!',
            `Yeni eklenen talep (${dName}), portföyünüzdeki şu mülklerle uyuşuyor:\n\n${matchedTitles}`,
            [{ text: 'Tamam' }]
          );
        }, 500);
      }
    }

    setShowDemandModal(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.financeTopBar}>
        <View>
          <Text style={styles.title}>Portföy & Talep Yönetimi</Text>
          <Text style={styles.subtitle}>Mülkler, Ada/Parsel & Alıcı Talepleri</Text>
        </View>
        <TouchableOpacity
          style={styles.quickAddBtn}
          onPress={activeTab === 'Portfoyler' ? openNewPortfolioModal : openNewDemandModal}
        >
          <Text style={styles.quickAddBtnText}>{activeTab === 'Portfoyler' ? '+ Mülk Ekle' : '+ Talep Ekle'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'Portfoyler' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('Portfoyler')}
        >
          <Text style={[styles.subTabText, activeTab === 'Portfoyler' && styles.subTabTextActive]}>🏢 Portföy Listesi ({portfolios.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'Talepler' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('Talepler')}
        >
          <Text style={[styles.subTabText, activeTab === 'Talepler' && styles.subTabTextActive]}>🎯 Alıcı Talepleri ({demands.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 100 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {activeTab === 'Portfoyler' && (
          <View style={styles.section}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {propertyTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.filterChip, selectedTypeFilter === type && styles.filterChipActive]}
                  onPress={() => setSelectedTypeFilter(type)}
                >
                  <Text style={[styles.filterChipText, selectedTypeFilter === type && styles.filterChipTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredPortfolios.length === 0 && (
              <Text style={styles.emptyText}>Bu kategoride kayıtlı portföy bulunmuyor.</Text>
            )}

            {filteredPortfolios.map((item) => (
              <View key={item.id} style={styles.bankCard}>
                <View style={styles.bankCardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.portfolioTypeBadge}>
                      <Text style={styles.portfolioTypeText}>{item.type}</Text>
                    </View>
                    <Text style={[styles.bankName, { marginTop: 6 }]}>{item.title}</Text>
                  </View>
                  <View style={styles.iconActionsRow}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEditPortfolioModal(item)}><Text style={styles.iconBtnText}>✏️</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeletePortfolio(item.id, item.title)}><Text style={styles.iconBtnText}>🗑️</Text></TouchableOpacity>
                  </View>
                </View>

                {(item.island || item.parcel) && (
                  <View style={styles.adaParcelBox}>
                    <Text style={styles.adaParcelText}>
                      Ada: <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>{item.island || '-'}</Text> | Parsel: <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>{item.parcel || '-'}</Text>
                    </Text>
                  </View>
                )}

                {item.details ? <Text style={styles.portfolioDetails}>{item.details}</Text> : null}

                <View style={[styles.bankDetailsRow, { justifyContent: 'flex-end', marginTop: 8 }]}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.bankDetailLabel}>İstenen Fiyat / Değer</Text>
                    <Text style={[styles.bankDetailValue, { color: '#4ade80', fontSize: 16 }]}>₺{item.price.toLocaleString('tr-TR')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Talepler' && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>🎯 Müşteri Talep & İstek Listesi</Text>
              <TouchableOpacity onPress={openNewDemandModal}><Text style={styles.linkText}>+ Talep Ekle</Text></TouchableOpacity>
            </View>

            {demands.length === 0 && (
              <Text style={styles.emptyText}>Henüz kayıtlı talep bulunmuyor.</Text>
            )}

            {demands.map((dem) => (
              <View key={dem.id} style={styles.bankCard}>
                <View style={styles.bankCardTop}>
                  <View>
                    <Text style={styles.bankName}>{dem.name}</Text>
                    <Text style={styles.creditSub}>📞 {dem.phone}</Text>
                  </View>
                  <View style={styles.iconActionsRow}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEditDemandModal(dem)}><Text style={styles.iconBtnText}>✏️</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteDemand(dem.id, dem.name)}><Text style={styles.iconBtnText}>🗑️</Text></TouchableOpacity>
                  </View>
                </View>

                <View style={styles.demandRequestBox}>
                  <Text style={styles.demandRequestLabel}>Aradığı / İstediği Özellikler:</Text>
                  <Text style={styles.demandRequestText}>{dem.request}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* PORTFÖY MODAL */}
      <Modal visible={showPortfolioModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingPortfolioId ? 'Portföy Düzenle' : 'Yeni Portföy / Mülk Ekle'}</Text>
            
            <TextInput style={styles.input} placeholder="Mülk Başlığı (Örn: Ören Sahil Lüks Konut)" placeholderTextColor="#71717a" value={pTitle} onChangeText={setPTitle} />
            
            <Text style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 6 }}>Kategori Seçin:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {propertyTypes.filter(t => t !== 'Tümü').map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.modalTypeChip, pType === t && styles.modalTypeChipActive]}
                  onPress={() => setPType(t)}
                >
                  <Text style={[styles.modalTypeChipText, pType === t && styles.modalTypeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TextInput style={[styles.input, { width: '48%' }]} placeholder="Ada No (Opsiyonel)" placeholderTextColor="#71717a" value={pIsland} onChangeText={setPIsland} />
              <TextInput style={[styles.input, { width: '48%' }]} placeholder="Parsel No (Opsiyonel)" placeholderTextColor="#71717a" value={pParcel} onChangeText={setPParcel} />
            </View>

            <TextInput style={styles.input} placeholder="Fiyat / Değer (TL)" placeholderTextColor="#71717a" keyboardType="numeric" value={pPrice} onChangeText={setPPrice} />
            <TextInput style={styles.input} placeholder="Ek Detaylar (Metrekare, Konum vb.)" placeholderTextColor="#71717a" value={pDetails} onChangeText={setPDetails} />

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPortfolioModal(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePortfolio}><Text style={styles.saveBtnText}>Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* TALEP MODAL */}
      <Modal visible={showDemandModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingDemandId ? 'Talebi Düzenle' : 'Yeni Alıcı Talebi Ekle'}</Text>
            <TextInput style={styles.input} placeholder="Müşteri Adı Soyadı" placeholderTextColor="#71717a" value={dName} onChangeText={setDName} />
            <TextInput style={styles.input} placeholder="Cep Telefonu No" placeholderTextColor="#71717a" keyboardType="phone-pad" value={dPhone} onChangeText={setDPhone} />
            <TextInput style={styles.input} placeholder="İstediği Özellikler (Örn: Konut veya Arsa)" placeholderTextColor="#71717a" value={dRequest} onChangeText={setDRequest} />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDemandModal(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDemand}><Text style={styles.saveBtnText}>Kaydet</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- ANA UYGULAMA YÖNETİCİSİ ---
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [currentTab, setCurrentTab] = useState('Home');
  const [syncStatus, setSyncStatus] = useState('Bulut Veriler Yükleniyor...');

  const [accounts, setAccounts] = useState([]);
  const [credits, setCredits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [creditors, setCreditors] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [demands, setDemands] = useState([]);

  // Alt menünün aşağı kaydırınca otomatik gizlenmesi için animasyon değeri
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);

  const handleScroll = (event) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    if (diff > 5 && currentY > 40) {
      // Aşağı kaydırılıyor -> Alt menüyü gizle
      Animated.timing(scrollAnim, {
        toValue: 90,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else if (diff < -5 || currentY <= 10) {
      // Yukarı kaydırılıyor veya en üstte -> Alt menüyü göster
      Animated.timing(scrollAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    lastScrollY.current = currentY;
  };

  const handleLoginSuccess = async (email) => {
    setUserEmail(email);
    setIsAuthenticated(true);
    setSyncStatus('Buluttan Veriler Eşitleniyor...');

    const cloudData = await CloudService.loadUserData(email);
    if (cloudData) {
      setAccounts(cloudData.accounts || []);
      setCredits(cloudData.credits || []);
      setTransactions(cloudData.transactions || []);
      setCreditors(cloudData.creditors || []);
      setPortfolios(cloudData.portfolios || []);
      setDemands(cloudData.demands || []);
      setSyncStatus('Bulut Senkronizasyonu Aktif');
    } else {
      setAccounts([
        { id: '1', name: 'Ziraat Bankası (Vadesiz)', cash: 45250, overdraft: 25000 },
        { id: '2', name: 'Garanti BBVA (Ticari)', cash: 128500, overdraft: 50000 },
      ]);
      setCredits([
        { id: '1', name: 'Ofis Yatırım Kredisi', totalInstallments: 24, currentInstallment: 8, amount: 14200, paymentDay: 18 },
      ]);
      setTransactions([
        { id: '1', type: 'gelir', title: 'Danışmanlık Geliri', category: 'Komisyon', amount: 48000, date: '12.11.2026' },
      ]);
      setCreditors([
        { id: '1', name: 'Ahmet Yılmaz', phone: '0532 555 4433', amount: 35000 },
      ]);
      setPortfolios([
        { id: '1', title: 'Ören Sahil Lüks Konut', type: 'Konut', island: '142', parcel: '5', price: 3250000, details: 'Deniz manzaralı geniş konut.' },
        { id: '2', title: 'Pelitköy Zeytinlik', type: 'Zeytinlik', island: '88', parcel: '12', price: 850000, details: 'İçinde verimli zeytin ağaçları var.' },
      ]);
      setDemands([
        { id: '1', name: 'Mehmet Demir', phone: '0505 123 4567', request: 'Şarköy civarında konut veya arsa arıyor.' },
      ]);
      setSyncStatus('Bulut Senkronizasyonu Aktif');
    }
  };

  useEffect(() => {
    if (isAuthenticated && userEmail) {
      CloudService.saveUserData(userEmail, { accounts, credits, transactions, creditors, portfolios, demands });
    }
  }, [accounts, credits, transactions, creditors, portfolios, demands]);

  if (!isAuthenticated) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const totalCash = accounts.reduce((sum, a) => sum + a.cash, 0);
  const totalAvailable = accounts.reduce((sum, a) => sum + a.cash + a.overdraft, 0);
  const todayDay = new Date().getDate();
  const upcomingCreditsCount = credits.filter((c) => {
    let diff = c.paymentDay - todayDay;
    if (diff < 0) diff += 30;
    return diff <= 7;
  }).length;

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <View style={{ flex: 1 }}>
        {currentTab === 'Home' ? (
          <HomeScreen
            navigation={setCurrentTab}
            userEmail={userEmail}
            totalCash={totalCash}
            totalAvailable={totalAvailable}
            upcomingCreditsCount={upcomingCreditsCount}
            syncStatus={syncStatus}
            onScroll={handleScroll}
          />
        ) : currentTab === 'Finans' ? (
          <FinanceScreen
            accounts={accounts}
            setAccounts={setAccounts}
            credits={credits}
            setCredits={setCredits}
            transactions={transactions}
            setTransactions={setTransactions}
            creditors={creditors}
            setCreditors={setCreditors}
            onScroll={handleScroll}
          />
        ) : (
          <PortfolioScreen
            portfolios={portfolios}
            setPortfolios={setPortfolios}
            demands={demands}
            setDemands={setDemands}
            onScroll={handleScroll}
          />
        )}
      </View>

      <Animated.View style={[styles.tabBar, { transform: [{ translateY: scrollAnim }] }]}>
        <TouchableOpacity style={[styles.tabItem, currentTab === 'Home' && styles.activeTab]} onPress={() => setCurrentTab('Home')}>
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={[styles.tabText, currentTab === 'Home' && styles.activeTabText]}>Özet</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tabItem, currentTab === 'Finans' && styles.activeTab]} onPress={() => setCurrentTab('Finans')}>
          <Text style={styles.tabIcon}>💳</Text>
          <Text style={[styles.tabText, currentTab === 'Finans' && styles.activeTabText]}>Finans</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tabItem, currentTab === 'Portfoy' && styles.activeTab]} onPress={() => setCurrentTab('Portfoy')}>
          <Text style={styles.tabIcon}>🏢</Text>
          <Text style={[styles.tabText, currentTab === 'Portfoy' && styles.activeTabText]}>Portföy & Talep</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setIsAuthenticated(false)}>
          <Text style={styles.tabIcon}>🚪</Text>
          <Text style={styles.tabText}>Çıkış</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: { 
    flex: 1, 
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'android' ? 10 : 0 
  },
  authContainer: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 24 },
  authHeader: { alignItems: 'center', marginBottom: 25 },
  headerSubtitle: { color: '#a1a1aa', fontSize: 11, letterSpacing: 3, marginBottom: 8 },
  patronBox: { borderWidth: 2, borderColor: '#882222', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 8, marginBottom: 15, backgroundColor: '#181212' },
  patronBoxText: { color: '#ffffff', fontSize: 28, fontWeight: 'bold', letterSpacing: 4 },
  authTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  authSubtitleText: { color: '#71717a', fontSize: 13 },
  formCard: { backgroundColor: '#1e1e24', padding: 20, borderRadius: 16, marginBottom: 20 },
  input: { backgroundColor: '#121212', color: '#ffffff', padding: 13, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#27272a', fontSize: 14 },
  rememberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingHorizontal: 4 },
  rememberText: { color: '#a1a1aa', fontSize: 13 },
  primaryButton: { backgroundColor: '#882222', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  primaryButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  biometricButton: { backgroundColor: '#27272a', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#3f3f46' },
  biometricButtonText: { color: '#38bdf8', fontWeight: 'bold', fontSize: 13 },
  switchButton: { alignItems: 'center', marginTop: 15 },
  switchButtonText: { color: '#38bdf8', fontSize: 13 },
  footerBranding: { alignItems: 'center', marginTop: 10 },
  footerText: { color: '#71717a', fontSize: 11 },
  footerBrandHighlight: { color: '#a1a1aa', fontSize: 12, fontWeight: 'bold', marginVertical: 2 },

  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 16 },
  header: { marginTop: 10, marginBottom: 16 },
  greeting: { color: '#a1a1aa', fontSize: 13 },
  title: { color: '#ffffff', fontSize: 23, fontWeight: 'bold' },
  subtitle: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  cardContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  card: { backgroundColor: '#1e1e24', borderRadius: 12, padding: 16, width: '48%' },
  cardTitle: { color: '#a1a1aa', fontSize: 12, marginBottom: 6 },
  cardValue: { color: '#ffffff', fontSize: 19, fontWeight: 'bold' },
  cardHint: { color: '#71717a', fontSize: 10, marginTop: 4 },
  section: { marginTop: 10, marginBottom: 18 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#38bdf8', fontSize: 15, fontWeight: 'bold' },
  linkText: { color: '#38bdf8', fontSize: 13, fontWeight: 'bold' },
  emptyText: { color: '#71717a', fontSize: 13, fontStyle: 'italic', marginVertical: 8 },
  actionButton: { backgroundColor: '#882222', padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  cloudBadge: { backgroundColor: '#18181b', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  cloudBadgeText: { color: '#4ade80', fontSize: 12, fontWeight: 'bold' },

  financeTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 12 },
  quickAddBtn: { backgroundColor: '#882222', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  quickAddBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  notificationBanner: { backgroundColor: '#2a1515', borderWidth: 1, borderColor: '#ef4444', borderRadius: 10, padding: 12, marginBottom: 12 },
  notificationTitle: { color: '#f87171', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  notificationText: { color: '#e4e4e7', fontSize: 12, marginTop: 2 },

  subTabRow: { flexDirection: 'row', backgroundColor: '#1e1e24', borderRadius: 10, padding: 4, marginBottom: 14 },
  subTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  subTabBtnActive: { backgroundColor: '#27272a' },
  subTabText: { color: '#71717a', fontSize: 11, fontWeight: '600' },
  subTabTextActive: { color: '#38bdf8', fontWeight: 'bold' },

  chartCard: { backgroundColor: '#18181b', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#27272a', marginBottom: 14 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  chartTitle: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  chartSub: { color: '#71717a', fontSize: 11 },
  trendBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  trendBadgeText: { fontSize: 13, fontWeight: 'bold' },
  chartMonthsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 4 },
  chartMonthLabel: { color: '#71717a', fontSize: 11 },

  summaryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryBox: { backgroundColor: '#1e1e24', width: '48.5%', padding: 14, borderRadius: 12 },
  summaryLabel: { color: '#a1a1aa', fontSize: 11, marginBottom: 4 },
  summaryAmount: { fontSize: 17, fontWeight: 'bold' },
  totalPowerCard: { backgroundColor: '#17202a', borderWidth: 1, borderColor: '#38bdf8', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalPowerLabel: { color: '#e4e4e7', fontSize: 13, fontWeight: '600' },
  totalPowerValue: { color: '#38bdf8', fontSize: 18, fontWeight: 'bold' },
  quickActionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  miniActionBtn: { backgroundColor: '#1e1e24', width: '48.5%', padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  miniActionText: { color: '#e4e4e7', fontSize: 13, fontWeight: '600' },

  bankCard: { backgroundColor: '#1e1e24', borderRadius: 12, padding: 14, marginBottom: 10 },
  bankCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  bankName: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  iconActionsRow: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 6, marginLeft: 6, backgroundColor: '#27272a', borderRadius: 6 },
  iconBtnText: { fontSize: 12 },
  bankDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#27272a', paddingTop: 10 },
  bankDetailLabel: { color: '#71717a', fontSize: 11 },
  bankDetailValue: { fontSize: 14, fontWeight: 'bold', marginTop: 2 },

  creditCard: { backgroundColor: '#1e1e24', borderRadius: 12, padding: 14, marginBottom: 10 },
  creditTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  creditTitle: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  creditSub: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  installmentPill: { backgroundColor: '#27272a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  installmentPillText: { color: '#38bdf8', fontSize: 12, fontWeight: 'bold' },
  progressBg: { height: 6, backgroundColor: '#121212', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: '#38bdf8' },
  creditBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditAmountValue: { color: '#f87171', fontSize: 16, fontWeight: 'bold' },

  filterScroll: { marginBottom: 12 },
  filterChip: { backgroundColor: '#1e1e24', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#27272a' },
  filterChipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  filterChipText: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#121212', fontWeight: 'bold' },
  
  modalTypeChip: { backgroundColor: '#121212', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 6, borderWidth: 1, borderColor: '#27272a' },
  modalTypeChipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  modalTypeChipText: { color: '#a1a1aa', fontSize: 12, fontWeight: 'bold' },
  modalTypeChipTextActive: { color: '#121212', fontWeight: 'bold' },

  txRow: { backgroundColor: '#1e1e24', padding: 13, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  txCatBadge: { backgroundColor: '#27272a', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
  txCatText: { color: '#38bdf8', fontSize: 11, fontWeight: '600' },
  txDate: { color: '#71717a', fontSize: 11 },
  txAmount: { fontSize: 15, fontWeight: 'bold' },
  miniIconBtn: { padding: 4, marginLeft: 4, backgroundColor: '#27272a', borderRadius: 4 },
  miniIconText: { fontSize: 10 },

  portfolioTypeBadge: { backgroundColor: '#17202a', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#38bdf8' },
  portfolioTypeText: { color: '#38bdf8', fontSize: 11, fontWeight: 'bold' },
  adaParcelBox: { backgroundColor: '#121212', padding: 8, borderRadius: 6, marginTop: 8 },
  adaParcelText: { color: '#a1a1aa', fontSize: 12 },
  portfolioDetails: { color: '#a1a1aa', fontSize: 12, marginTop: 6 },

  demandRequestBox: { backgroundColor: '#121212', padding: 10, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#27272a' },
  demandRequestLabel: { color: '#38bdf8', fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  demandRequestText: { color: '#ffffff', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e1e24', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#27272a' },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  typeSwitchRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#121212', alignItems: 'center', marginHorizontal: 4 },
  typeBtnGelir: { backgroundColor: '#166534' },
  typeBtnGider: { backgroundColor: '#991b1b' },
  typeBtnText: { color: '#ffffff', fontWeight: 'bold' },
  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 10 },
  cancelBtnText: { color: '#a1a1aa', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#882222', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  saveBtnText: { color: '#ffffff', fontWeight: 'bold' },

  tabBar: { 
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 65, 
    backgroundColor: '#18181b', 
    borderTopWidth: 1, 
    borderTopColor: '#27272a', 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center', 
    paddingBottom: 5,
    zIndex: 999,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  activeTab: { borderTopWidth: 2, borderTopColor: '#38bdf8' },
  tabIcon: { fontSize: 18, marginBottom: 2 },
  tabText: { color: '#71717a', fontSize: 11 },
  activeTabText: { color: '#38bdf8', fontWeight: 'bold' },
});