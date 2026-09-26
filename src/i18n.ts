export const languages = [{code:'en',name:'English'},{code:'ar',name:'العربية'},{code:'es',name:'Español'},{code:'fr',name:'Français'},{code:'de',name:'Deutsch'},{code:'pt',name:'Português'},{code:'it',name:'Italiano'},{code:'nl',name:'Nederlands'},{code:'ru',name:'Русский'},{code:'tr',name:'Türkçe'},{code:'hi',name:'हिन्दी'},{code:'ja',name:'日本語'},{code:'ko',name:'한국어'},{code:'zh',name:'中文'},{code:'id',name:'Bahasa Indonesia'},{code:'ur',name:'اردو'}];
export const brand = 'Exotic'; // English fallback; the UI uses t('brand')
// Locales written right-to-left. Kept here so the document direction, the equation
// bidi override and the numeral work all agree on one list.
const rtlLocales = ['ar','ur'];
export function isRTL(lang:string){ return rtlLocales.includes(lang); }

// Arabic sets the question mark on the baseline mirror image, U+061F, rather than
// the Latin "?", and the puzzle placeholders and decorative "?" glyphs follow suit.
// Display only: a placeholder is never parsed, and a typed answer is digits only.
//
// Arabic only, deliberately. U+061F is bidi class AL, a LETTER, so it takes part in
// right-to-left ordering, whereas the Latin "?" is a neutral and does not. In Arabic
// that changes nothing, because those equations already lay out right-to-left. In
// Urdu it is harmful: Urdu numerals are class EN, so with the ASCII mark those
// equations rendered correctly, and swapping in U+061F moved the mark to the far end
// of the line - "۵ + ؟ = ۹" displayed as "۵ + ۹ = ؟". Measured, then reverted.
const markLocales = ['ar'];
const ARABIC_QUESTION_MARK = '؟';
export function localiseMark(text:string, lang:string){
  return markLocales.includes(lang) ? text.replace(/\?/g, ARABIC_QUESTION_MARK) : text;
}

const rows = String.raw`
brand|Exotic|إكزوتيك|Exótico|Exotique|Exotisch|Exótico|Esotico|Exotisch|Экзотик|Egzotik|एक्ज़ोटिक|エキゾティック|엑조틱|异域|Eksotik|ایگزوتک
docTitle|A little logic. A lot of possibility.|منطق قليل. إمكانات لا نهائية.|Un poco de lógica. Mucha posibilidad.|Un peu de logique. Beaucoup de possibilités.|Eine Prise Logik. Viele Möglichkeiten.|Um pouco de lógica. Muita possibilidade.|Un po' di logica. Molte possibilità.|Een beetje logica. Veel mogelijkheden.|Немного логики. Много возможностей.|Biraz mantık. Çok olasılık.|थोड़ी तर्क। ढेरों संभावनाएँ।|少しの論理。たくさんの可能性。|조금의 논리. 많은 가능성.|少许逻辑，无限可能。|Sedikit logika. Banyak kemungkinan.|تھوڑی منطق۔ بہت امکانات۔
docDesc|Four digits. Infinite possibilities. A beautifully simple game for a wonderfully complex mind.|أربعة أرقام. إمكانات لا نهائية. لعبة بسيطة بجمال لفكر معقّد.|Cuatro dígitos. Posibilidades infinitas. Un juego sencillo para una mente compleja.|Quatre chiffres. Possibilités infinies. Un jeu d'une simplicité-syntaxe pour un esprit complexe.|Vier Ziffern. Unendliche Möglichkeiten. Ein wunderbar einfaches Spiel für einen wunderbar komplexen Geist.|Quatro dígitos. Possibilidades infinitas. Um jogo lindamente simples para uma mente complexa.|Quattro cifre. Infinite possibilità. Un gioco bellamente semplice per una mente complessa.|Vier cijfers. Oneindige mogelijkheden. Een prachtig eenvoudig spel voor een verbluffend ingewikkeld verstand.|Четыре цифры. Бесконечные возможности. Простая игра для сложного ума.|Dört rakam. Sonsuz olasılık. Zihni karmaşık olanlar için benzersiz derecede basit bir oyun.|चार अंक। अनंत संभावनाएँ। एक सुंदर सरल खेल, एक अद्भुत जटिल मस्तिष्क के लिए।|四桁。無限の可能性。素晴らしい頭脳のための、美しいシンプルなゲーム。|네 자리. 무한한 가능성. 복잡한 사고를 위한 아름답게 단순한 게임.|四位数字。无限可能。为复杂头脑打造的绝美简约游戏。|Empat digit. Kemungkinan tak terbatas. Permainan sederhana yang indah untuk pikiran yang rumit.|چار ہندسے۔ لامحدود امکانات۔ پیچیدہ ذہن کے لیے خوبصورت سادہ کھیل۔
play|PLAY|العب|JUGAR|JOUER|SPIELEN|JOGAR|GIOCA|SPELEN|ИГРАТЬ|OYNA|खेलें|プレイ|플레이|开始|MAIN|کھیلیں
personal|YOUR SPACE|مساحتك|TU ESPACIO|VOTRE ESPACE|DEIN BEREICH|SEU ESPAÇO|IL TUO SPAZIO|JOUW RUIMTE|ВАШ РАЗДЕЛ|ALANIN|आपका स्थान|マイスペース|내 공간|个人空间|RUANG ANDA|آپ کی جگہ
home|Overview|نظرة عامة|Resumen|Vue d’ensemble|Übersicht|Visão geral|Panoramica|Overzicht|Обзор|Genel bakış|अवलोकन|概要|개요|总览|Ringkasan|جائزہ
solo|Single player|لاعب واحد|Un jugador|Solo|Einzelspieler|Um jogador|Giocatore singolo|Singleplayer|Одиночная игра|Tek oyuncu|एकल खिलाड़ी|シングルプレイ|싱글 플레이|单人游戏|Pemain tunggal|واحد کھلاڑی
multi|Multiplayer|متعدد اللاعبين|Multijugador|Multijoueur|Mehrspieler|Multijogador|Multigiocatore|Multiplayer|Мультиплеер|Çok oyunculu|मल्टीप्लेयर|マルチプレイ|멀티 플레이|多人游戏|Multipemain|متعدد کھلاڑی
shops|The shops|المتاجر|Las tiendas|Les boutiques|Die Shops|As lojas|I negozi|De winkels|Магазины|Mağazalar|दुकानें|ショップ|상점|商店|Toko|دکانیں
profiles|Your profiles|ملفاتك|Tus perfiles|Vos profils|Deine Profile|Seus perfis|I tuoi profili|Jouw profielen|Ваши профили|Profillerin|आपकी प्रोफ़ाइल|プロフィール|내 프로필|个人资料|Profil Anda|آپ کے پروفائل
settings|Settings|الإعدادات|Ajustes|Paramètres|Einstellungen|Configurações|Impostazioni|Instellingen|Настройки|Ayarlar|सेटिंग्स|設定|설정|设置|Pengaturan|ترتیبات
how|How to play|كيفية اللعب|Cómo jugar|Comment jouer|So geht’s|Como jogar|Come giocare|Hoe te spelen|Как играть|Nasıl oynanır|कैसे खेलें|遊び方|게임 방법|玩法说明|Cara bermain|کیسے کھیلیں
welcome|A good day to be curious.|يوم جميل للفضول.|Un buen día para ser curioso.|Une belle journée pour être curieux.|Ein guter Tag, neugierig zu sein.|Um bom dia para ter curiosidade.|Un bel giorno per essere curiosi.|Een goede dag om nieuwsgierig te zijn.|Хороший день для любопытства.|Merak etmek için güzel bir gün.|जिज्ञासा के लिए अच्छा दिन।|好奇心を楽しむ一日。|호기심을 즐기기 좋은 날.|今天，保持好奇。|Hari yang baik untuk penasaran.|تجسس کے لیے اچھا دن۔
eyebrow|FOUR DIGITS. INFINITE POSSIBILITIES.|أربعة أرقام. احتمالات لا نهائية.|CUATRO DÍGITOS. INFINITAS POSIBILIDADES.|QUATRE CHIFFRES. POSSIBILITÉS INFINIES.|VIER ZIFFERN. UNENDLICHE MÖGLICHKEITEN.|QUATRO DÍGITOS. INFINITAS POSSIBILIDADES.|QUATTRO CIFRE. INFINITE POSSIBILITÀ.|VIER CIJFERS. ONEINDIG VEEL MOGELIJKHEDEN.|ЧЕТЫРЕ ЦИФРЫ. БЕСКОНЕЧНЫЕ ВОЗМОЖНОСТИ.|DÖRT RAKAM. SONSUZ OLASILIK.|चार अंक। अनंत संभावनाएँ।|四桁。無限の可能性。|네 자리. 무한한 가능성.|四位数字。无限可能。|EMPAT DIGIT. TAK TERBATAS KEMUNGKINAN.|چار ہندسے۔ لامحدود امکانات۔
hero1|Your mind.|عقلك.|Tu mente.|Votre esprit.|Dein Verstand.|Sua mente.|La tua mente.|Jouw geest.|Ваш разум.|Zihnin.|आपका दिमाग।|あなたの頭脳。|당신의 두뇌.|你的头脑。|Pikiran Anda.|آپ کا ذہن۔
hero2|Your only key.|مفتاحك الوحيد.|Tu única llave.|Votre seule clé.|Dein einziger Schlüssel.|Sua única chave.|La tua unica chiave.|Jouw enige sleutel.|Ваш единственный ключ.|Tek anahtarın.|आपकी एकमात्र चाबी।|唯一の鍵。|당신만의 열쇠.|唯一的钥匙。|Satu-satunya kunci.|آپ کی واحد چابی۔
heroDesc|A little logic. A spark of curiosity. Crack four-digit codes, challenge your mind, and make every discovery count.|قليل من المنطق وشرارة فضول. فك رموزًا من أربعة أرقام وتحدّ عقلك واستمتع بكل اكتشاف.|Un poco de lógica y curiosidad. Descifra códigos de cuatro dígitos y desafía tu mente.|Un peu de logique, une étincelle de curiosité. Déchiffrez des codes à quatre chiffres et défiez votre esprit.|Ein wenig Logik und Neugier. Knacke vierstellige Codes und fordere deinen Verstand.|Um pouco de lógica e curiosidade. Decifre códigos de quatro dígitos e desafie sua mente.|Un po’ di logica e curiosità. Decifra codici a quattro cifre e sfida la tua mente.|Een beetje logica en nieuwsgierigheid. Kraak viercijferige codes en daag jezelf uit.|Немного логики и любопытства. Разгадывайте четырёхзначные коды и тренируйте ум.|Biraz mantık ve merak. Dört haneli kodları çöz, zihnini zorla.|थोड़ा तर्क और जिज्ञासा। चार अंकों के कोड सुलझाएँ और दिमाग को चुनौती दें।|少しの論理と好奇心。四桁のコードを解いて、頭脳に挑戦しましょう。|약간의 논리와 호기심. 네 자리 코드를 풀고 두뇌에 도전하세요.|一点逻辑，一丝好奇。破解四位密码，挑战思维，享受每次发现。|Sedikit logika dan rasa ingin tahu. Pecahkan kode empat digit dan tantang pikiran Anda.|تھوڑی منطق اور تجسس۔ چار ہندسوں کے کوڈ حل کریں اور ذہن کو چیلنج کریں۔
start|Let’s crack a code|لنحل رمزًا|Descifrar un código|Déchiffrer un code|Einen Code knacken|Decifrar um código|Decifra un codice|Kraak een code|Разгадать код|Bir kod çözelim|कोड सुलझाएँ|コードを解く|코드 풀기|开始解码|Pecahkan kode|کوڈ حل کریں
choose|Find your kind of challenge.|اختر تحديك.|Encuentra tu desafío.|Trouvez votre défi.|Finde deine Herausforderung.|Encontre seu desafio.|Trova la tua sfida.|Vind jouw uitdaging.|Найдите свой вызов.|Kendi meydan okumanı bul.|अपनी चुनौती चुनें।|自分に合う挑戦を。|나만의 도전을 찾아보세요.|找到适合你的挑战。|Temukan tantangan Anda.|اپنا چیلنج تلاش کریں۔
chooseSub|Go at your own pace. Or raise the stakes.|العب بوتيرتك أو ارفع التحدي.|A tu ritmo. O sube la apuesta.|À votre rythme. Ou relevez le défi.|Dein Tempo. Oder mehr Nervenkitzel.|No seu ritmo. Ou aumente o desafio.|Al tuo ritmo. O alza la posta.|Op jouw tempo. Of verhoog de inzet.|В своём темпе. Или на скорость.|Kendi hızında. Ya da rekabetle.|अपनी गति से या मुकाबले में।|自分のペースで。それとも競争？|내 속도로, 또는 치열하게.|独自思考，或同场竞技。|Santai atau berkompetisi.|اپنی رفتار سے یا مقابلہ کریں۔
soloDesc|Just you, your intuition, and the next breakthrough. 90 levels to keep you thinking.|أنت وحدسك والاكتشاف التالي. 90 مستوى لتشغيل عقلك.|Tú y tu intuición. 90 niveles para hacerte pensar.|Vous et votre intuition. 90 niveaux pour réfléchir.|Du und deine Intuition. 90 Level zum Nachdenken.|Você e sua intuição. 90 níveis para pensar.|Tu e il tuo intuito. 90 livelli per riflettere.|Jij en je intuïtie. 90 levels om na te denken.|Вы и ваша интуиция. 90 уровней для размышлений.|Sen ve sezgilerin. Düşündüren 90 seviye.|आप और आपका अंतर्ज्ञान। सोचने के लिए 90 स्तर।|自分と直感。思考を刺激する九十レベル。|당신과 직관. 생각을 깨우는 구십 개 레벨.|跟随直觉，探索九十个关卡。|Anda dan intuisi. 90 level untuk berpikir.|آپ اور آپ کی بصیرت۔ سوچنے کے لیے 90 درجے۔
multiDesc|Good minds think alike. Great minds race. Bring your friends and crack it first.|العقول الجيدة تتشابه والعظيمة تتسابق. تحدّ أصدقاءك.|Las grandes mentes compiten. Reta a tus amigos.|Les grands esprits font la course. Défiez vos amis.|Große Köpfe messen sich. Fordere Freunde heraus.|Grandes mentes competem. Desafie seus amigos.|Le grandi menti gareggiano. Sfida gli amici.|Grote geesten racen. Daag je vrienden uit.|Великие умы соревнуются. Бросьте вызов друзьям.|Harika zihinler yarışır. Arkadaşlarına meydan oku.|महान दिमाग मुकाबला करते हैं। दोस्तों को चुनौती दें।|優れた頭脳で競争。友達と挑戦しよう。|뛰어난 두뇌들의 경쟁. 친구에게 도전하세요.|聪明的大脑，精彩的较量。邀请好友，率先破解。|Pikiran hebat berlomba. Tantang teman Anda.|عظیم ذہن مقابلہ کرتے ہیں۔ دوستوں کو چیلنج دیں۔
levels|levels|مستوى|niveles|niveaux|Level|níveis|livelli|levels|уровней|seviye|स्तर|レベル|레벨|关卡|level|درجے
difficulties|difficulties|صعوبات|dificultades|difficultés|Schwierigkeiten|dificuldades|difficoltà|moeilijkheden|сложности|zorluk|कठिनाइयाँ|難易度|난이도|难度|kesulitan|مشکلات
atPace|At your pace|بوتيرتك|A tu ritmo|À votre rythme|Dein Tempo|No seu ritmo|Al tuo ritmo|Jouw tempo|В своём темпе|Kendi hızında|अपनी गति से|自分のペース|내 속도로|自由节奏|Sesuai ritme|اپنی رفتار سے
realTime|Real-time battles|مواجهات مباشرة|Batallas en vivo|Duels en direct|Live-Duelle|Batalhas ao vivo|Sfide dal vivo|Live gevechten|Живые поединки|Canlı rekabet|लाइव मुकाबले|リアルタイム対戦|실시간 대결|实时对战|Pertarungan langsung|براہ راست مقابلے
enterSolo|Explore the levels|استكشف المستويات|Explorar niveles|Explorer les niveaux|Level entdecken|Explorar níveis|Esplora i livelli|Ontdek de levels|Открыть уровни|Seviyeleri keşfet|स्तर देखें|レベルを見る|레벨 살펴보기|探索关卡|Jelajahi level|درجے دریافت کریں
enterMulti|Enter the arena|ادخل الساحة|Entrar a la arena|Entrer dans l’arène|Arena betreten|Entrar na arena|Entra nell’arena|Betreed de arena|Войти на арену|Arenaya gir|अखाड़े में जाएँ|アリーナへ|아레나 입장|进入竞技场|Masuk arena|میدان میں جائیں
journey|Small steps. Sharp mind.|خطوات صغيرة. عقل حاد.|Pasos pequeños. Mente aguda.|Petits pas. Esprit vif.|Kleine Schritte. Wacher Geist.|Pequenos passos. Mente afiada.|Piccoli passi. Mente acuta.|Kleine stappen. Scherpe geest.|Маленькие шаги. Острый ум.|Küçük adımlar. Keskin zihin.|छोटे कदम। तेज़ दिमाग।|小さな一歩。鋭い頭脳。|작은 걸음. 날카로운 두뇌.|小小进步，敏锐思维。|Langkah kecil. Pikiran tajam.|چھوٹے قدم۔ تیز ذہن۔
journeySub|Your next discovery is just four digits away.|اكتشافك التالي على بعد أربعة أرقام.|Tu próximo descubrimiento está a cuatro dígitos.|Votre découverte est à quatre chiffres.|Deine Entdeckung ist vier Ziffern entfernt.|Sua descoberta está a quatro dígitos.|La tua scoperta è a quattro cifre.|Je ontdekking is vier cijfers verder.|Открытие в четырёх цифрах от вас.|Keşfin dört rakam uzakta.|आपकी खोज चार अंक दूर है।|次の発見まで、あと四桁。|다음 발견까지 단 네 자리.|四位数字之外，就是新的发现。|Penemuan Anda hanya empat digit lagi.|آپ کی دریافت چار ہندسے دور ہے۔
viewAll|View all levels|كل المستويات|Ver niveles|Tous les niveaux|Alle Level|Ver níveis|Tutti i livelli|Alle levels|Все уровни|Tüm seviyeler|सभी स्तर|全レベル|모든 레벨|全部关卡|Semua level|تمام درجے
level|Level|المستوى|Nivel|Niveau|Level|Nível|Livello|Level|Уровень|Seviye|स्तर|レベル|레벨|关卡|Level|درجہ
easy|Easy|سهل|Fácil|Facile|Leicht|Fácil|Facile|Makkelijk|Легко|Kolay|आसान|かんたん|쉬움|简单|Mudah|آسان
medium|Medium|متوسط|Medio|Moyen|Mittel|Médio|Medio|Gemiddeld|Средне|Orta|मध्यम|ふつう|보통|普通|Sedang|درمیانہ
hard|Hard|صعب|Difícil|Difficile|Schwer|Difícil|Difficile|Moeilijk|Сложно|Zor|कठिन|むずかしい|어려움|困难|Sulit|مشکل
math|Math|رياضيات|Matemáticas|Maths|Mathematik|Matemática|Matematica|Wiskunde|Математика|Matematik|गणित|数学|수학|数学|Matematika|ریاضی
logic|Logic|منطق|Lógica|Logique|Logik|Lógica|Logica|Logica|Логика|Mantık|तर्क|論理|논리|逻辑|Logika|منطق
riddles|Riddles|ألغاز|Acertijos|Énigmes|Rätsel|Enigmas|Indovinelli|Raadsels|Загадки|Bilmeceler|पहेलियाँ|なぞなぞ|수수께끼|谜语|Teka-teki|پہیلیاں
science|Science|علوم|Ciencia|Sciences|Wissenschaft|Ciência|Scienza|Wetenschap|Наука|Bilim|विज्ञान|科学|과학|科学|Sains|سائنس
trivia|Trivia|معلومات عامة|Cultura general|Culture générale|Allgemeinwissen|Conhecimentos|Cultura generale|Algemene kennis|Эрудиция|Genel kültür|सामान्य ज्ञान|雑学|상식|常识|Pengetahuan|معلومات عامہ
locked|Locked|مقفل|Bloqueado|Verrouillé|Gesperrt|Bloqueado|Bloccato|Vergrendeld|Закрыто|Kilitli|बंद|ロック中|잠김|未解锁|Terkunci|مقفل
ready|Ready to crack|جاهز للحل|Listo para resolver|À déchiffrer|Bereit zum Knacken|Pronto para decifrar|Pronto da decifrare|Klaar om te kraken|Готов к разгадке|Çözülmeye hazır|सुलझाने को तैयार|挑戦しよう|풀 준비 완료|等待破解|Siap dipecahkan|حل کے لیے تیار
completed|Cracked|تم الحل|Descifrado|Déchiffré|Geknackt|Decifrado|Decifrato|Gekraakt|Разгадано|Çözüldü|सुलझाया|解読済み|해독 완료|已破解|Terpecahkan|حل شدہ
footer|Made for curious minds.|صُنع للعقول الفضولية.|Para mentes curiosas.|Pour les esprits curieux.|Für neugierige Köpfe.|Para mentes curiosas.|Per menti curiose.|Voor nieuwsgierige geesten.|Для любознательных.|Meraklı zihinler için.|जिज्ञासु दिमाग के लिए।|好奇心あふれる人へ。|호기심 많은 당신을 위해.|为好奇的头脑而生。|Untuk pikiran penasaran.|متجسس ذہنوں کے لیے۔
nextMove|YOUR NEXT MOVE|خطوتك التالية|TU PRÓXIMO PASO|VOTRE PROCHAIN PAS|DEIN NÄCHSTER ZUG|SEU PRÓXIMO PASSO|LA TUA PROSSIMA MOSSA|JOUW VOLGENDE ZET|ВАШ СЛЕДУЮЩИЙ ХОД|SIRADAKİ HAMLE|आपका अगला कदम|次の一手|다음 한 수|下一步|LANGKAH BERIKUTNYA|آپ کی اگلی چال
sidebarNote|Stay curious.\nThink outside the code.|ابق فضوليًا.\nفكّر خارج الرمز.|Sigue curioso.\nPiensa más allá.|Restez curieux.\nPensez autrement.|Bleib neugierig.\nDenk weiter.|Seja curioso.\nPense além.|Sii curioso.\nPensa oltre.|Blijf nieuwsgierig.\nDenk verder.|Будьте любопытны.\nМыслите шире.|Meraklı kal.\nFarklı düşün.|जिज्ञासु रहें।\nअलग सोचें।|好奇心を忘れずに。\n自由な発想を。|호기심을 유지하세요.\n자유롭게 생각하세요.|保持好奇。\n跳出密码思考。|Tetap penasaran.\nBerpikir berbeda.|متجسس رہیں۔\nمنفرد سوچیں۔
balance|Your balance|رصيدك|Tu saldo|Votre solde|Dein Guthaben|Seu saldo|Il tuo saldo|Jouw saldo|Ваш баланс|Bakiyen|आपका शेष|残高|잔액|你的余额|Saldo Anda|آپ کا بیلنس
soloCoins|Solo coins|عملات الفردي|Monedas solo|Pièces solo|Solo-Münzen|Moedas solo|Monete solo|Solo-munten|Соло-монеты|Solo jeton|एकल सिक्के|ソロコイン|솔로 코인|单人金币|Koin solo|واحد سکے
arenaCoins|Arena coins|عملات الساحة|Monedas arena|Pièces arène|Arena-Münzen|Moedas arena|Monete arena|Arena-munten|Монеты арены|Arena jetonu|अखाड़ा सिक्के|アリーナコイン|아레나 코인|竞技金币|Koin arena|میدان کے سکے
back|Back|رجوع|Volver|Retour|Zurück|Voltar|Indietro|Terug|Назад|Geri|वापस|戻る|뒤로|返回|Kembali|واپس
close|Close|إغلاق|Cerrar|Fermer|Schließen|Fechar|Chiudi|Sluiten|Закрыть|Kapat|बंद करें|閉じる|닫기|关闭|Tutup|بند کریں
cancel|Cancel|إلغاء|Cancelar|Annuler|Abbrechen|Cancelar|Annulla|Annuleren|Отмена|İptal|रद्द करें|キャンセル|취소|取消|Batal|منسوخ
save|Save changes|حفظ التغييرات|Guardar|Enregistrer|Speichern|Salvar|Salva|Opslaan|Сохранить|Kaydet|सहेजें|保存|저장|保存更改|Simpan|محفوظ کریں
saved|Saved. You’re all set.|تم الحفظ.|Guardado.|Enregistré.|Gespeichert.|Salvo.|Salvato.|Opgeslagen.|Сохранено.|Kaydedildi.|सहेजा गया।|保存しました。|저장되었습니다.|已保存。|Tersimpan.|محفوظ ہوگیا۔
continue|Continue|متابعة|Continuar|Continuer|Weiter|Continuar|Continua|Doorgaan|Продолжить|Devam|जारी रखें|続ける|계속|继续|Lanjut|جاری رکھیں
check|Unlock the code|افتح الرمز|Desbloquear|Déverrouiller|Code entsperren|Desbloquear|Sblocca il codice|Ontgrendel de code|Открыть код|Kodu aç|कोड खोलें|コードを解錠|코드 잠금 해제|解锁密码|Buka kode|کوڈ کھولیں
answer|Your four-digit code|رمزك من أربعة أرقام|Tu código de cuatro dígitos|Votre code à quatre chiffres|Dein vierstelliger Code|Seu código de quatro dígitos|Il tuo codice a quattro cifre|Je viercijferige code|Ваш четырёхзначный код|Dört haneli kodun|आपका चार अंकों का कोड|四桁のコード|네 자리 코드|你的四位密码|Kode empat digit Anda|آپ کا چار ہندسوں کا کوڈ
wrong|Not quite. Try a different angle.|ليس تمامًا. جرّب طريقة أخرى.|Casi. Prueba otro enfoque.|Pas tout à fait. Essayez autrement.|Noch nicht. Versuch es anders.|Quase. Tente outro caminho.|Non proprio. Prova diversamente.|Nog niet. Probeer iets anders.|Не совсем. Попробуйте иначе.|Olmadı. Farklı düşün.|अभी नहीं। फिर कोशिश करें।|もう一息。別の角度から。|아직 아니에요. 다른 방법으로.|还差一点，换个角度想想。|Belum tepat. Coba cara lain.|درست نہیں۔ دوبارہ کوشش کریں۔
win|Beautifully cracked.|حل رائع.|Perfectamente descifrado.|Brillamment déchiffré.|Brillant geknackt.|Muito bem decifrado.|Brillantemente decifrato.|Prachtig gekraakt.|Прекрасно разгадано.|Harika çözüldü.|शानदार समाधान।|見事な解読。|멋지게 해독했어요.|漂亮地破解了。|Terpecahkan dengan indah.|بہترین حل۔
reward|Reward earned|المكافأة المكتسبة|Recompensa|Récompense|Belohnung|Recompensa|Ricompensa|Beloning|Награда|Ödül|पुरस्कार|獲得報酬|획득 보상|获得奖励|Hadiah diperoleh|انعام حاصل
replay|Play again|العب مجددًا|Jugar de nuevo|Rejouer|Nochmal spielen|Jogar novamente|Rigioca|Opnieuw spelen|Играть снова|Tekrar oyna|फिर खेलें|もう一度|다시 플레이|再玩一次|Main lagi|دوبارہ کھیلیں
next|Next level|المستوى التالي|Siguiente nivel|Niveau suivant|Nächstes Level|Próximo nível|Livello seguente|Volgend level|Следующий уровень|Sonraki seviye|अगला स्तर|次のレベル|다음 레벨|下一关|Level berikutnya|اگلا درجہ
attempts|Attempts|المحاولات|Intentos|Tentatives|Versuche|Tentativas|Tentativi|Pogingen|Попытки|Denemeler|प्रयास|挑戦回数|시도|尝试次数|Percobaan|کوششیں
hint|A little nudge|تلميح صغير|Una pequeña pista|Un petit indice|Ein kleiner Tipp|Uma pequena dica|Un piccolo aiuto|Een kleine hint|Небольшая подсказка|Küçük bir ipucu|एक छोटा संकेत|小さなヒント|작은 힌트|一点提示|Petunjuk kecil|چھوٹا اشارہ
reveal|Reveal a digit|اكشف رقمًا|Revelar un dígito|Révéler un chiffre|Ziffer aufdecken|Revelar um dígito|Rivela una cifra|Onthul een cijfer|Открыть цифру|Rakam göster|एक अंक दिखाएँ|一桁を表示|한 자리 공개|揭示一位|Ungkap satu digit|ایک ہندسہ دکھائیں
ai|Ask AI for a hint|اطلب تلميحًا ذكيًا|Pedir pista a IA|Demander un indice IA|KI-Tipp anfordern|Pedir dica à IA|Chiedi un indizio IA|Vraag AI om een hint|Подсказка ИИ|Yapay zekâ ipucu|AI संकेत पूछें|AIにヒントを聞く|AI 힌트 요청|请求AI提示|Minta petunjuk AI|AI سے اشارہ لیں
noItems|Visit the solo shop to stock up.|للحصول على المزيد زر متجر الفردي.|Visita la tienda solo.|Visitez la boutique solo.|Besuche den Solo-Shop.|Visite a loja solo.|Visita il negozio solo.|Bezoek de solo-winkel.|Посетите соло-магазин.|Solo mağazaya uğra.|एकल दुकान पर जाएँ।|ソロショップへ。|솔로 상점을 방문하세요.|请前往单人商店。|Kunjungi toko solo.|واحد دکان پر جائیں۔
shopTitle|A little edge. Earned, not bought.|أفضلية صغيرة. تُكتسب باللعب.|Una ventaja que te ganas.|Un avantage qui se mérite.|Ein Vorteil. Ehrlich erspielt.|Uma vantagem conquistada.|Un vantaggio guadagnato.|Een voorsprong. Zelf verdiend.|Преимущество, заработанное игрой.|Kazanılmış bir avantaj.|जीतकर पाएँ बढ़त।|プレイで得る、少しの強み。|플레이로 얻는 작은 우위.|靠实力赢得的小小优势。|Keunggulan yang diraih.|کما کر حاصل کردہ برتری۔
shopDesc|Win games, earn coins, make them count. Each mode has its own wallet and collection.|اربح واكسب العملات. لكل وضع محفظته ومجموعته.|Gana monedas jugando. Cada modo tiene su cartera.|Gagnez des pièces. Chaque mode a sa collection.|Gewinne Münzen. Jeder Modus hat ein eigenes Guthaben.|Ganhe moedas. Cada modo tem sua carteira.|Vinci monete. Ogni modalità ha il suo portafoglio.|Verdien munten. Elke modus heeft een eigen saldo.|Побеждайте и копите монеты. У режимов разные кошельки.|Kazan, jeton biriktir. Her modun cüzdanı ayrıdır.|जीतकर सिक्के पाएँ। हर मोड का अलग बटुआ है।|勝利でコイン獲得。モードごとに別の財布。|승리하고 코인을 모으세요. 모드별 지갑이 달라요.|赢取金币。各模式拥有独立钱包和藏品。|Menang dan raih koin. Tiap mode punya dompet sendiri.|جیت کر سکے کمائیں۔ ہر موڈ کا الگ بٹوہ ہے۔
hintPack|The nudge|التلميح|La pista|Le coup de pouce|Der Denkanstoß|A dica|La dritta|Het zetje|Подсказка|İpucu|संकेत|ひらめき|힌트|灵感提示|Petunjuk|اشارہ
hintDesc|One thoughtful hint when you need a fresh perspective.|تلميح عند الحاجة إلى منظور جديد.|Una pista para una nueva perspectiva.|Un indice pour voir autrement.|Ein Tipp für eine neue Perspektive.|Uma dica para uma nova perspectiva.|Un indizio per una nuova prospettiva.|Een hint voor een nieuwe blik.|Подсказка для нового взгляда.|Yeni bir bakış açısı için ipucu.|नए नज़रिए के लिए एक संकेत।|新しい視点のためのヒント一回分。|새로운 관점을 위한 힌트 한 개.|换个角度思考的一次提示。|Satu petunjuk untuk sudut pandang baru.|نئے زاویے کے لیے ایک اشارہ۔
digitPack|The missing piece|القطعة الناقصة|La pieza que falta|La pièce manquante|Das fehlende Teil|A peça que falta|Il pezzo mancante|Het ontbrekende stukje|Недостающая деталь|Eksik parça|लापता टुकड़ा|最後のピース|빠진 조각|缺失拼图|Bagian yang hilang|گمشدہ ٹکڑا
digitDesc|Reveal the first digit of a code. Find your way from there.|اكشف الرقم الأول ثم أكمل بنفسك.|Revela el primer dígito y sigue.|Révélez le premier chiffre puis continuez.|Decke die erste Ziffer auf.|Revele o primeiro dígito e continue.|Rivela la prima cifra e continua.|Onthul het eerste cijfer en ga verder.|Откройте первую цифру и продолжайте.|İlk rakamı gör, devamını bul.|पहला अंक देखें, आगे स्वयं खोजें।|最初の一桁を表示。あとは自力で。|첫 자리를 공개하고 나머지를 푸세요.|揭示第一位，继续自己探索。|Ungkap digit pertama, temukan sisanya.|پہلا ہندسہ دیکھیں، باقی خود ڈھونڈیں۔
nightPack|Midnight identity|هوية منتصف الليل|Identidad nocturna|Identité de minuit|Mitternachts-Identität|Identidade noturna|Identità notturna|Middernacht-identiteit|Полночный образ|Gece kimliği|मध्यरात्रि पहचान|ミッドナイト|미드나잇 아이덴티티|午夜身份|Identitas malam|نصف شب شناخت
nightDesc|An exclusive moon emblem for your arena profile.|شعار قمر حصري لملف الساحة.|Emblema lunar exclusivo para tu perfil.|Un emblème lune pour votre profil.|Ein Mond-Emblem für dein Arena-Profil.|Emblema lunar para seu perfil.|Emblema lunare per il tuo profilo.|Maanembleem voor je profiel.|Лунная эмблема для арены.|Arena profiline özel ay amblemi.|अखाड़ा प्रोफ़ाइल के लिए चाँद का चिह्न।|アリーナ用の特別な月の紋章。|아레나 프로필 전용 달 엠블럼.|竞技资料专属月亮徽章。|Lambang bulan untuk profil arena.|میدان پروفائل کے لیے چاند کا نشان۔
crownPack|The codebreaker|محطم الرموز|El descifrador|Le décrypteur|Der Codeknacker|O decifrador|Il decifratore|De codekraker|Взломщик кодов|Kod çözücü|कोड विशेषज्ञ|コードブレイカー|코드브레이커|解码大师|Pemecah kode|کوڈ ماہر
crownDesc|A crown emblem. A quiet statement in every lobby.|شعار تاج يظهر في كل غرفة.|Una corona para destacar en cada sala.|Une couronne dans chaque salon.|Ein Kronen-Emblem für jede Lobby.|Uma coroa em cada sala.|Una corona in ogni sala.|Een kroon in elke lobby.|Корона для каждой комнаты.|Her lobide taç amblemi.|हर लॉबी में ताज का चिह्न।|ロビーで輝く王冠の紋章。|모든 로비에서 빛나는 왕관.|在每个大厅展示皇冠徽章。|Lambang mahkota di setiap lobi.|ہر کمرے میں تاج کا نشان۔
buy|Get item|احصل عليه|Obtener|Obtenir|Holen|Obter|Ottieni|Verkrijg|Получить|Al|प्राप्त करें|入手|획득|获取|Dapatkan|حاصل کریں
owned|Owned|مملوك|Adquirido|Possédé|Im Besitz|Adquirido|Posseduto|In bezit|Куплено|Sahipsin|स्वामित्व|所有済み|보유 중|已拥有|Dimiliki|ملکیت
notEnough|Keep cracking to earn more coins.|واصل الحل لكسب العملات.|Sigue jugando para ganar monedas.|Jouez pour gagner des pièces.|Spiele weiter für mehr Münzen.|Continue para ganhar moedas.|Continua per vincere monete.|Speel verder voor meer munten.|Играйте, чтобы заработать монеты.|Jeton kazanmak için oynamaya devam.|और सिक्कों के लिए खेलते रहें।|プレイしてコインを貯めよう。|계속 플레이하고 코인을 모으세요.|继续破解，赢得更多金币。|Terus bermain untuk meraih koin.|مزید سکوں کے لیے کھیلتے رہیں۔
purchased|Added to your collection.|أُضيف إلى مجموعتك.|Añadido a tu colección.|Ajouté à votre collection.|Deiner Sammlung hinzugefügt.|Adicionado à coleção.|Aggiunto alla collezione.|Toegevoegd aan je collectie.|Добавлено в коллекцию.|Koleksiyonuna eklendi.|संग्रह में जोड़ा गया।|コレクションに追加しました。|컬렉션에 추가되었어요.|已添加至藏品。|Ditambahkan ke koleksi.|آپ کے مجموعے میں شامل۔
create|Create a room|أنشئ غرفة|Crear sala|Créer un salon|Raum erstellen|Criar sala|Crea una stanza|Maak een kamer|Создать комнату|Oda oluştur|कमरा बनाएँ|ルームを作成|방 만들기|创建房间|Buat ruang|کمرہ بنائیں
join|Join a room|انضم لغرفة|Unirse a sala|Rejoindre un salon|Raum beitreten|Entrar na sala|Entra in una stanza|Word lid van een kamer|Войти в комнату|Odaya katıl|कमरे में शामिल हों|ルームに参加|방 참여|加入房间|Gabung ruang|کمرے میں شامل ہوں
roomCode|Room code|رمز الغرفة|Código de sala|Code du salon|Raumcode|Código da sala|Codice stanza|Kamercode|Код комнаты|Oda kodu|कमरे का कोड|ルームコード|방 코드|房间代码|Kode ruang|کمرے کا کوڈ
first|First to crack|الأسرع في الحل|Primero en descifrar|Premier à déchiffrer|Zuerst geknackt|Primeiro a decifrar|Il primo a decifrare|Als eerste kraken|Кто первый|İlk çözen|पहले सुलझाएँ|早解き対決|먼저 풀기|率先破解|Pecahkan pertama|پہلے حل کریں
timeAttack|Time attack|سباق الزمن|Contrarreloj|Contre-la-montre|Zeitrennen|Contra o tempo|Contro il tempo|Tijdrace|На время|Zamana karşı|समय चुनौती|タイムアタック|타임 어택|限时挑战|Serangan waktu|وقت کا مقابلہ
rounds|Rounds|الجولات|Rondas|Manches|Runden|Rodadas|Round|Rondes|Раунды|Turlar|राउंड|ラウンド|라운드|回合|Ronde|راؤنڈ
category|Category|الفئة|Categoría|Catégorie|Kategorie|Categoria|Categoria|Categorie|Категория|Kategori|श्रेणी|カテゴリー|카테고리|类别|Kategori|زمرہ
random|Surprise me|اختيار عشوائي|Sorpréndeme|Surprenez-moi|Überrasch mich|Surpreenda-me|Sorprendimi|Verras me|Сюрприз|Beni şaşırt|आश्चर्य दें|おまかせ|랜덤 선택|随机选择|Kejutkan saya|حیران کریں
waiting|Waiting for curious minds…|بانتظار العقول الفضولية…|Esperando jugadores…|En attente de joueurs…|Warte auf Mitspieler…|Aguardando jogadores…|In attesa di giocatori…|Wachten op spelers…|Ожидание игроков…|Oyuncular bekleniyor…|खिलाड़ियों का इंतज़ार…|プレイヤーを待っています…|플레이어 기다리는 중…|等待玩家加入…|Menunggu pemain…|کھلاڑیوں کا انتظار…
copy|Copy invite code|انسخ رمز الدعوة|Copiar código|Copier le code|Code kopieren|Copiar código|Copia codice|Code kopiëren|Копировать код|Kodu kopyala|कोड कॉपी करें|コードをコピー|초대 코드 복사|复制邀请码|Salin kode|کوڈ نقل کریں
copied|Copied to clipboard.|تم النسخ.|Copiado.|Copié.|Kopiert.|Copiado.|Copiato.|Gekopieerd.|Скопировано.|Kopyalandı.|कॉपी किया गया।|コピーしました。|복사되었습니다.|已复制。|Tersalin.|نقل ہوگیا۔
startMatch|Start the match|ابدأ المباراة|Empezar partida|Démarrer le match|Spiel starten|Iniciar partida|Avvia partita|Start de wedstrijd|Начать матч|Maçı başlat|मैच शुरू करें|対戦開始|경기 시작|开始比赛|Mulai pertandingan|میچ شروع کریں
leave|Leave room|غادر الغرفة|Salir de sala|Quitter le salon|Raum verlassen|Sair da sala|Lascia stanza|Verlaat kamer|Покинуть комнату|Odadan ayrıl|कमरा छोड़ें|ルーム退出|방 나가기|离开房间|Keluar ruang|کمرہ چھوڑیں
players|Players|اللاعبون|Jugadores|Joueurs|Spieler|Jogadores|Giocatori|Spelers|Игроки|Oyuncular|खिलाड़ी|プレイヤー|플레이어|玩家|Pemain|کھلاڑی
score|Score|النقاط|Puntos|Score|Punkte|Pontos|Punti|Score|Счёт|Puan|स्कोर|スコア|점수|得分|Skor|اسکور
matchOver|That’s a wrap.|انتهت المباراة.|Fin de la partida.|Match terminé.|Das war’s.|Fim de jogo.|Partita finita.|Dat was het.|Матч окончен.|Maç bitti.|मैच समाप्त।|対戦終了。|경기 종료.|比赛结束。|Pertandingan selesai.|میچ ختم۔
connect|Connect Supabase|ربط Supabase|Conectar Supabase|Connecter Supabase|Supabase verbinden|Conectar Supabase|Collega Supabase|Verbind Supabase|Подключить Supabase|Supabase bağla|Supabase जोड़ें|Supabaseに接続|Supabase 연결|连接Supabase|Hubungkan Supabase|Supabase جوڑیں
connectDesc|Online play needs your Supabase project. Solo play is ready now, with progress saved on this device.|اللعب عبر الإنترنت يحتاج مشروع Supabase. الفردي جاهز والتقدم محفوظ على جهازك.|El juego en línea requiere Supabase. El modo solo guarda tu progreso en este dispositivo.|Le jeu en ligne nécessite Supabase. Le solo sauvegarde sur cet appareil.|Online-Spiele brauchen Supabase. Solo-Fortschritt wird auf diesem Gerät gespeichert.|O modo online precisa de Supabase. O progresso solo é salvo neste dispositivo.|L’online richiede Supabase. I progressi solo sono salvati sul dispositivo.|Online spelen vereist Supabase. Solo-voortgang wordt hier opgeslagen.|Для онлайн-игры нужен Supabase. Соло-прогресс сохранён на устройстве.|Çevrimiçi oyun Supabase gerektirir. Solo ilerlemen bu cihazda kaydedilir.|ऑनलाइन के लिए Supabase चाहिए। एकल प्रगति इस डिवाइस पर सहेजी जाती है।|オンラインにはSupabaseが必要です。ソロの進行はこの端末に保存されます。|온라인 플레이에는 Supabase가 필요해요. 솔로 진행은 기기에 저장돼요.|在线对战需要Supabase。单人进度保存在此设备。|Online membutuhkan Supabase. Progres solo tersimpan di perangkat ini.|آن لائن کے لیے Supabase درکار ہے۔ واحد پیشرفت اس آلے پر محفوظ ہے۔
projectUrl|Project URL|رابط المشروع|URL del proyecto|URL du projet|Projekt-URL|URL do projeto|URL progetto|Project-URL|URL проекта|Proje URL|प्रोजेक्ट URL|プロジェクトURL|프로젝트 URL|项目URL|URL proyek|پروجیکٹ URL
publicKey|Publishable / anon key|المفتاح العام|Clave pública / anon|Clé publique / anon|Öffentlicher / Anon-Schlüssel|Chave pública / anon|Chiave pubblica / anon|Publieke / anon-sleutel|Публичный ключ|Genel / anonim anahtar|सार्वजनिक / anon कुंजी|公開 / anonキー|공개 / anon 키|公钥 / anon密钥|Kunci publik / anon|عوامی / anon کلید
signIn|Sign in|تسجيل الدخول|Iniciar sesión|Se connecter|Anmelden|Entrar|Accedi|Inloggen|Войти|Giriş yap|साइन इन|ログイン|로그인|登录|Masuk|لاگ ان
signUp|Create account|أنشئ حسابًا|Crear cuenta|Créer un compte|Konto erstellen|Criar conta|Crea account|Account maken|Создать аккаунт|Hesap oluştur|खाता बनाएँ|アカウント作成|계정 만들기|创建账户|Buat akun|اکاؤنٹ بنائیں
signOut|Sign out|تسجيل الخروج|Cerrar sesión|Se déconnecter|Abmelden|Sair|Esci|Uitloggen|Выйти|Çıkış yap|साइन आउट|ログアウト|로그아웃|退出登录|Keluar|لاگ آؤٹ
email|Email address|البريد الإلكتروني|Correo electrónico|Adresse e-mail|E-Mail-Adresse|E-mail|E-mail|E-mailadres|Электронная почта|E-posta|ईमेल पता|メールアドレス|이메일|电子邮箱|Alamat email|ای میل
password|Password|كلمة المرور|Contraseña|Mot de passe|Passwort|Senha|Password|Wachtwoord|Пароль|Şifre|पासवर्ड|パスワード|비밀번호|密码|Kata sandi|پاس ورڈ
name|Display name|اسم العرض|Nombre visible|Nom affiché|Anzeigename|Nome de exibição|Nome visualizzato|Weergavenaam|Имя|Görünen ad|प्रदर्शित नाम|表示名|표시 이름|昵称|Nama tampilan|ظاہری نام
checkEmail|Check your email to confirm your account.|تحقق من بريدك لتأكيد الحساب.|Revisa tu correo para confirmar.|Vérifiez votre e-mail pour confirmer.|Prüfe deine E-Mail zur Bestätigung.|Verifique seu e-mail para confirmar.|Controlla la tua e-mail per confermare.|Controleer je e-mail voor bevestiging.|Проверьте почту для подтверждения.|Onaylamak için e-postanı kontrol et.|पुष्टि के लिए ईमेल देखें।|メールでアカウントを確認してください。|이메일에서 계정을 확인하세요.|请检查邮件以确认账户。|Periksa email untuk konfirmasi.|تصدیق کے لیے ای میل دیکھیں۔
guest|Local player|لاعب محلي|Jugador local|Joueur local|Lokaler Spieler|Jogador local|Giocatore locale|Lokale speler|Локальный игрок|Yerel oyuncu|स्थानीय खिलाड़ी|ローカルプレイヤー|로컬 플레이어|本地玩家|Pemain lokal|مقامی کھلاڑی
profileDesc|A record of your curiosity. Your solo and arena identities stay separate.|سجل فضولك. هويتا الفردي والساحة منفصلتان.|Un registro de tu curiosidad. Las identidades se mantienen separadas.|Votre curiosité en chiffres. Vos identités restent distinctes.|Deine Neugier in Zahlen. Deine Identitäten bleiben getrennt.|Sua curiosidade registrada. As identidades ficam separadas.|La tua curiosità. Le identità restano separate.|Jouw nieuwsgierigheid. Je identiteiten blijven apart.|Запись вашего любопытства. Профили разделены.|Merakının kaydı. Kimliklerin ayrı kalır.|आपकी जिज्ञासा का रिकॉर्ड। पहचान अलग रहती हैं।|好奇心の記録。ソロとアリーナは別プロフィール。|호기심의 기록. 솔로와 아레나 프로필은 별개예요.|好奇心的足迹。单人和竞技身份各自独立。|Catatan rasa ingin tahu. Identitas tetap terpisah.|آپ کے تجسس کا ریکارڈ۔ شناختیں الگ رہتی ہیں۔
wins|Wins|الانتصارات|Victorias|Victoires|Siege|Vitórias|Vittorie|Overwinningen|Победы|Galibiyetler|जीत|勝利|승리|获胜|Kemenangan|جیت
collection|Your collection|مجموعتك|Tu colección|Votre collection|Deine Sammlung|Sua coleção|La tua collezione|Jouw collectie|Ваша коллекция|Koleksiyonun|आपका संग्रह|コレクション|내 컬렉션|你的藏品|Koleksi Anda|آپ کا مجموعہ
empty|A fresh start. Your story begins here.|بداية جديدة. قصتك تبدأ هنا.|Un nuevo comienzo. Tu historia empieza aquí.|Un nouveau départ. Votre histoire commence ici.|Ein neuer Anfang. Deine Geschichte beginnt hier.|Um novo começo. Sua história começa aqui.|Un nuovo inizio. La tua storia inizia qui.|Een frisse start. Je verhaal begint hier.|Новое начало. Ваша история начинается здесь.|Yeni başlangıç. Hikâyen burada başlıyor.|नई शुरुआत। आपकी कहानी यहाँ से शुरू।|新たな一歩。物語はここから。|새로운 시작. 이야기는 여기서 시작돼요.|全新开始，你的故事由此启程。|Awal baru. Kisah Anda dimulai di sini.|نئی شروعات۔ آپ کی کہانی یہاں سے۔
appearance|Appearance|المظهر|Apariencia|Apparence|Darstellung|Aparência|Aspetto|Weergave|Внешний вид|Görünüm|दिखावट|外観|화면 설정|外观|Tampilan|ظاہری شکل
light|Light|فاتح|Claro|Clair|Hell|Claro|Chiaro|Licht|Светлая|Açık|हल्का|ライト|라이트|浅色|Terang|روشن
dark|Dark|داكن|Oscuro|Sombre|Dunkel|Escuro|Scuro|Donker|Тёмная|Koyu|गहरा|ダーク|다크|深色|Gelap|تاریک
language|Language|اللغة|Idioma|Langue|Sprache|Idioma|Lingua|Taal|Язык|Dil|भाषा|言語|언어|语言|Bahasa|زبان
sound|Sound effects|المؤثرات الصوتية|Efectos de sonido|Effets sonores|Soundeffekte|Efeitos sonoros|Effetti sonori|Geluidseffecten|Звуковые эффекты|Ses efektleri|ध्वनि प्रभाव|効果音|효과음|音效|Efek suara|صوتی اثرات
motion|Reduce motion|تقليل الحركة|Reducir movimiento|Réduire les animations|Bewegung reduzieren|Reduzir movimento|Riduci movimento|Minder beweging|Меньше анимации|Hareketi azalt|गतिविधि घटाएँ|動きを減らす|동작 줄이기|减少动态|Kurangi gerakan|حرکت کم کریں
on|On|مفعّل|Activado|Activé|An|Ligado|Attivo|Aan|Вкл.|Açık|चालू|オン|켜짐|开启|Aktif|فعال
off|Off|معطّل|Desactivado|Désactivé|Aus|Desligado|Disattivo|Uit|Выкл.|Kapalı|बंद|オフ|꺼짐|关闭|Nonaktif|غیر فعال
data|Your data|بياناتك|Tus datos|Vos données|Deine Daten|Seus dados|I tuoi dati|Jouw gegevens|Ваши данные|Verilerin|आपका डेटा|データ|내 데이터|你的数据|Data Anda|آپ کا ڈیٹا
export|Export progress|تصدير التقدم|Exportar progreso|Exporter la progression|Fortschritt exportieren|Exportar progresso|Esporta progressi|Voortgang exporteren|Экспорт прогресса|İlerlemeyi dışa aktar|प्रगति निर्यात|進行をエクスポート|진행 내보내기|导出进度|Ekspor progres|پیشرفت برآمد
reset|Reset local progress|إعادة تعيين التقدم المحلي|Reiniciar progreso local|Réinitialiser la progression locale|Lokalen Fortschritt zurücksetzen|Redefinir progresso local|Reimposta progressi locali|Lokale voortgang wissen|Сбросить локальный прогресс|Yerel ilerlemeyi sıfırla|स्थानीय प्रगति रीसेट|ローカル進行をリセット|로컬 진행 초기화|重置本地进度|Atur ulang progres lokal|مقامی پیشرفت مٹائیں
resetConfirm|Erase your local levels, coins and items? This cannot be undone.|حذف المستويات والعملات والعناصر المحلية؟ لا يمكن التراجع.|¿Borrar niveles, monedas y objetos locales? No se puede deshacer.|Effacer niveaux, pièces et objets locaux ? Irréversible.|Lokale Level, Münzen und Items löschen? Nicht rückgängig machbar.|Apagar níveis, moedas e itens locais? Irreversível.|Eliminare livelli, monete e oggetti locali? Irreversibile.|Lokale levels, munten en items wissen? Onomkeerbaar.|Удалить локальные уровни, монеты и предметы? Необратимо.|Yerel seviye, jeton ve eşyalar silinsin mi? Geri alınamaz.|स्थानीय स्तर, सिक्के और वस्तुएँ मिटाएँ? यह वापस नहीं होगा।|レベル・コイン・アイテムを削除しますか？元に戻せません。|로컬 레벨, 코인, 아이템을 삭제할까요? 복구할 수 없어요.|删除本地关卡、金币和物品？此操作无法撤销。|Hapus level, koin dan item lokal? Tidak dapat dibatalkan.|مقامی درجے، سکے اور اشیاء مٹائیں؟ واپس نہیں ہوگا۔
how1|One question. One four-digit answer.|سؤال واحد. إجابة من أربعة أرقام.|Una pregunta. Cuatro dígitos.|Une question. Quatre chiffres.|Eine Frage. Vier Ziffern.|Uma pergunta. Quatro dígitos.|Una domanda. Quattro cifre.|Eén vraag. Vier cijfers.|Один вопрос. Четыре цифры.|Bir soru. Dört rakam.|एक प्रश्न। चार अंक।|一つの問題。四桁の答え。|한 문제. 네 자리 정답.|一道题，四位答案。|Satu soal. Empat digit.|ایک سوال۔ چار ہندسے۔
how2|Read closely, follow the clues, and enter your code. Leading zeroes count. Wrong guesses never cost coins.|اقرأ واتبع التلميحات وأدخل الرمز. الأصفار البادئة مهمة. لا تكلفة للتخمين الخاطئ.|Lee las pistas e introduce el código. Los ceros iniciales cuentan. Fallar no cuesta monedas.|Suivez les indices. Les zéros initiaux comptent. Les erreurs ne coûtent rien.|Folge den Hinweisen. Führende Nullen zählen. Fehler kosten keine Münzen.|Siga as pistas. Zeros iniciais contam. Erros não custam moedas.|Segui gli indizi. Gli zeri iniziali contano. Sbagliare non costa monete.|Volg de hints. Nullen vooraan tellen mee. Fouten kosten geen munten.|Читайте подсказки. Нули в начале важны. Ошибки не стоят монет.|İpuçlarını izle. Baştaki sıfırlar önemli. Yanlışlar jeton götürmez.|संकेत पढ़ें। शुरू के शून्य भी गिनें। गलत उत्तर पर सिक्के नहीं कटते।|ヒントに従って入力。先頭の〇も含めます。間違えてもコインは減りません。|단서를 따라 입력하세요. 앞자리 영도 포함돼요. 오답으로 코인을 잃지 않아요.|仔细阅读线索，输入密码。保留前导零，猜错不会扣金币。|Ikuti petunjuk. Nol di depan dihitung. Jawaban salah tidak mengurangi koin.|اشارے پڑھیں۔ شروع کے صفر بھی شامل ہیں۔ غلط جواب پر سکے نہیں کٹتے۔
how3|Clear levels in order. Earn coins on your first win. Each difficulty is its own 30-level journey.|أكمل بالترتيب. اربح عملات عند أول فوز. لكل صعوبة 30 مستوى.|Avanza en orden. Gana monedas en la primera victoria. 30 niveles por dificultad.|Avancez dans l’ordre. Récompense au premier succès. 30 niveaux par difficulté.|Spiele der Reihe nach. Münzen beim ersten Sieg. 30 Level pro Schwierigkeit.|Avance em ordem. Moedas na primeira vitória. 30 níveis por dificuldade.|Avanza in ordine. Monete alla prima vittoria. 30 livelli per difficoltà.|Speel op volgorde. Munten bij eerste winst. 30 levels per moeilijkheid.|Проходите по порядку. Монеты за первую победу. По 30 уровней.|Sırayla ilerle. İlk galibiyette jeton kazan. Her zorlukta 30 seviye.|क्रम से खेलें। पहली जीत पर सिक्के। हर कठिनाई में 30 स्तर।|順番にクリア。初勝利でコイン獲得。難易度ごとに三十レベル。|순서대로 클리어하세요. 첫 승리에 코인을 받아요. 난이도별 삼십 레벨.|按顺序闯关，首次获胜获得金币。每种难度三十关。|Selesaikan berurutan. Koin saat pertama menang. 30 level tiap kesulitan.|ترتیب سے کھیلیں۔ پہلی جیت پر سکے۔ ہر مشکل میں 30 درجے۔
how4|In the arena, the same language gets the same puzzle. Different languages get their own code. First to crack scores immediately; Time attack gives everyone 45 seconds per round.|في الساحة تتطابق الأسئلة لنفس اللغة. اللغات المختلفة لها رموز مختلفة. الأسرع يسجل فورًا؛ سباق الزمن يمنح 45 ثانية للجولة.|Mismo idioma, mismo acertijo. Idiomas distintos, códigos distintos. El primero puntúa; contrarreloj da 45 segundos por ronda.|Même langue, même énigme. Langues différentes, codes différents. Le premier marque ; 45 secondes par manche chronométrée.|Gleiche Sprache, gleiches Rätsel. Andere Sprache, anderer Code. Der Erste punktet; Zeitrennen hat 45 Sekunden pro Runde.|Mesmo idioma, mesmo enigma. Idiomas diferentes, códigos diferentes. O primeiro pontua; 45 segundos por rodada cronometrada.|Stessa lingua, stesso enigma. Lingue diverse, codici diversi. Il primo segna; 45 secondi per round a tempo.|Zelfde taal, zelfde puzzel. Andere talen, andere codes. De eerste scoort; tijdrace geeft 45 seconden per ronde.|Один язык — одна загадка. Разные языки — разные коды. Первый получает балл; на время даётся 45 секунд за раунд.|Aynı dil, aynı bulmaca. Farklı diller, farklı kodlar. İlk çözen puan alır; zaman modu tur başına 45 saniye verir.|एक भाषा, एक पहेली। अलग भाषा, अलग कोड। पहले सुलझाने पर अंक; समय चुनौती में प्रति राउंड 45 सेकंड।|同じ言語なら同じ問題、違う言語なら別のコード。早解きは最初の正解で得点。タイムアタックは一回四十五秒。|같은 언어는 같은 문제, 다른 언어는 다른 코드. 먼저 풀면 즉시 득점, 타임 어택은 라운드당 사십오 초.|相同语言对应相同谜题，不同语言拥有不同密码。率先破解立即得分；限时模式每回合四十五秒。|Bahasa sama, soal sama. Bahasa berbeda, kode berbeda. Pemecah pertama mendapat poin; mode waktu 45 detik per ronde.|ایک زبان، ایک پہیلی۔ مختلف زبانیں، مختلف کوڈ۔ پہلے حل پر پوائنٹ؛ وقت موڈ میں 45 سیکنڈ فی راؤنڈ۔
local|Saved on this device|محفوظ على هذا الجهاز|Guardado en este dispositivo|Enregistré sur cet appareil|Auf diesem Gerät gespeichert|Salvo neste dispositivo|Salvato sul dispositivo|Op dit apparaat opgeslagen|Сохранено на устройстве|Bu cihazda kayıtlı|इस डिवाइस पर सहेजा|この端末に保存|이 기기에 저장됨|保存在此设备|Tersimpan di perangkat|اس آلے پر محفوظ
connected|Connected|متصل|Conectado|Connecté|Verbunden|Conectado|Connesso|Verbonden|Подключено|Bağlı|कनेक्टेड|接続済み|연결됨|已连接|Terhubung|منسلک
error|Something didn’t connect. Please try again.|تعذر الاتصال. حاول مجددًا.|No se pudo conectar. Inténtalo de nuevo.|Connexion impossible. Réessayez.|Keine Verbindung. Versuch es erneut.|Falha na conexão. Tente novamente.|Connessione fallita. Riprova.|Verbinding mislukt. Probeer opnieuw.|Нет соединения. Попробуйте снова.|Bağlanamadı. Tekrar dene.|कनेक्शन नहीं हुआ। फिर कोशिश करें।|接続できませんでした。再試行してください。|연결하지 못했어요. 다시 시도하세요.|连接失败，请重试。|Gagal terhubung. Coba lagi.|رابطہ نہیں ہوا۔ دوبارہ کوشش کریں۔
needPlayers|At least 2 players to start.|يلزم لاعبان على الأقل.|Se necesitan 2 jugadores.|Il faut au moins 2 joueurs.|Mindestens 2 Spieler nötig.|São necessários 2 jogadores.|Servono almeno 2 giocatori.|Minimaal 2 spelers nodig.|Нужно минимум 2 игрока.|En az 2 oyuncu gerekli.|कम से कम 2 खिलाड़ी चाहिए।|二人以上で開始できます。|최소 이명이 필요해요.|至少需要两名玩家。|Minimal 2 pemain.|کم از کم 2 کھلاڑی درکار۔
host|Host|المضيف|Anfitrión|Hôte|Host|Anfitrião|Ospite|Host|Ведущий|Kurucu|मेज़बान|ホスト|호스트|房主|Tuan rumah|میزبان
roundDone|Code cracked. Waiting for the next round.|تم الحل. بانتظار الجولة التالية.|Resuelto. Esperando la siguiente ronda.|Résolu. En attente de la prochaine manche.|Geknackt. Warte auf die nächste Runde.|Resolvido. Aguardando a próxima rodada.|Risolto. In attesa del prossimo round.|Gekraakt. Wachten op volgende ronde.|Разгадано. Ждите следующий раунд.|Çözüldü. Sonraki tur bekleniyor.|सुलझा लिया। अगले राउंड की प्रतीक्षा।|解読成功。次のラウンドを待機中。|해독 완료. 다음 라운드 대기 중.|已破解，等待下一回合。|Terpecahkan. Menunggu ronde berikutnya.|حل ہوگیا۔ اگلے راؤنڈ کا انتظار۔
allDone|Every code cracked. A brilliant journey.|كل الرموز محلولة. رحلة رائعة.|Todo descifrado. Un gran viaje.|Tout est déchiffré. Quel parcours.|Alles geknackt. Eine tolle Reise.|Tudo decifrado. Uma bela jornada.|Tutto decifrato. Un viaggio brillante.|Alles gekraakt. Een prachtige reis.|Все коды разгаданы. Отличный путь.|Tüm kodlar çözüldü. Harika yolculuk.|सभी कोड सुलझाए। शानदार सफर।|全コード解読。素晴らしい旅でした。|모든 코드 해독. 멋진 여정이었어요.|所有密码均已破解，精彩的旅程。|Semua kode terpecahkan. Perjalanan hebat.|تمام کوڈ حل۔ بہترین سفر۔
menu|Open menu|افتح القائمة|Abrir menú|Ouvrir le menu|Menü öffnen|Abrir menu|Apri menu|Menu openen|Открыть меню|Menüyü aç|मेनू खोलें|メニューを開く|메뉴 열기|打开菜单|Buka menu|مینو کھولیں
moved|That round has moved on.|انتقلت هذه الجولة.|Esa ronda ya avanzó.|Cette manche est passée.|Diese Runde ist vorbei.|Essa rodada já avançou.|Quel round è passato.|Deze ronde is voorbij.|Раунд уже сменился.|Bu tur geçti.|यह राउंड आगे बढ़ गया।|このラウンドは終了しました。|이 라운드는 이미 넘어갔어요.|这一回合已经结束。|Ronde ini sudah berlanjut.|یہ راؤنڈ آگے بڑھ چکا۔
aiUnavailable|AI hints are resting. Use a shop hint, or try again later.|تلميحات الذكاء ترتاح الآن. استخدم تلميح المتجر أو حاول لاحقًا.|Las pistas de IA descansan. Usa una de la tienda o inténtalo luego.|Les indices IA se reposent. Utilisez un indice boutique ou réessayez.|KI-Tipps pausieren. Nutze einen Shop-Tipp oder versuch es später.|As dicas de IA estão em pausa. Use uma dica da loja ou tente depois.|Gli indizi IA riposano. Usa un indizio del negozio o riprova.|AI-hints rusten even. Gebruik een winkelhint of probeer later.|Подсказки ИИ отдыхают. Используйте подсказку из магазина или позже.|Yapay zekâ ipuçları dinleniyor. Mağaza ipucunu kullan veya sonra dene.|AI संकेत अभी उपलब्ध नहीं। दुकान का संकेत लें या बाद में कोशिश करें।|AIヒントは休憩中です。ショップのヒントを使うか、後でもう一度。|AI 힌트가 잠시 쉬고 있어요. 상점 힌트를 쓰거나 나중에 다시 시도하세요.|AI提示暂时休息。请使用商店提示，或稍后再试。|Petunjuk AI sedang istirahat. Gunakan petunjuk toko atau coba lagi nanti.|AI اشارے آرام کر رہے ہیں۔ دکان کا اشارہ استعمال کریں یا بعد میں کوشش کریں۔
agent|Build agent|وكيل البناء|Agente de construction|Agent de build|Build-Agent|Agente de build|Agente di build|Bouwagent|Агент сборки|Derleme ajanı|बिल्ड एजेंट|ビルドエージェント|빌드 에이전트|构建代理|Agen_build|تیار کرنے ایجنٹ
agentTitle|Add to the game|أضف إلى اللعبة|Añade al juego|Ajouter au jeu|Zum Spiel hinzufügen|Adicione ao jogo|Aggiungi al gioco|Toevoegen aan het spel|Добавить в игру|Oyuna ekle|गेम में जोड़ें|ゲームに追加|게임에 추가|添加到游戏|Tambahkan ke game|گیم میں شامل کریں
agentIntro|Describe a change. The agent reads the project, works out the smallest set of edits, and shows you every one before anything is written.|صف تغييرًا. يقرأ الوكيل المشروع ويحسب أصغر مجموعة تعديلات ويعرضها عليك قبل كتابة أي شيء.|Describe un cambio. El agente lee el proyecto, calcula el conjunto mínimo de ediciones y te las muestra antes de escribir nada.|Décrivez un changement. L’agent lit le projet, calcule le plus petit jeu de modifications et vous les montre avant toute écriture.|Beschreibe eine Änderung. Der Agent liest das Projekt, ermittelt die kleinste Menge an Bearbeitungen und zeigt sie dir, bevor etwas geschrieben wird.|Descreva uma mudança. O agente lê o projeto, calcula o menor conjunto de edições e mostra tudo antes de escrever.|Descrivi una modifica. L’agente legge il progetto, calcola il set minimo di modifiche e te le mostra prima di scrivere qualsiasi cosa.|Beschrijf een wijziging. De agent leest het project, bepaalt de kleinste set bewerkingen en toont ze allemaal vóórdat er iets geschreven wordt.|Опишите изменение. Агент прочитает проект, найдёт минимальный набор правок и покажет их все до того, как что-то будет записано.|Bir değişiklik tarif et. Ajan projeyi okur, en küçük düzenleme kümesini bulur ve bir şey yazılmadan hepsini sana gösterir.|एक बदलाव बताएँ। एजेंट प्रोजेक्ट पढ़ता है, सबसे छोटे बदलाव निकालता है, और कुछ भी लिखने से पहले सब कुछ दिखाता है।|変更内容を説明してください。エージェントがプロジェクトを読み、最小限の編集を洗い出し、書き込み前にすべて表示されます。|변경 내용을 설명하세요. 에이전트가 프로젝트를 읽고 최소한의 수정만 찾아, 아무것도 기록하기 전에 모두 보여줍니다.|描述一项改动。代理会读取项目，算出最小的改动集，并在写入任何内容之前全部展示给你。|Jelaskan sebuah perubahan. Agen membaca proyek, menentukan himpunan edit terkecil, dan menampilkan semuanya sebelum ada yang ditulis.|ایک تبدیلی بیان کریں۔ ایجنٹ پروجیکٹ پڑھتا ہے، سب سے چھوٹا تبدیلی مجموعہ نکالتا ہے، اور کچھ بھی لکھے سے پہلے سب دکھاتا ہے۔
agentSignIn|Sign in to single player to use the build agent.|سجّل الدخول في اللعب الفردي لاستخدام وكيل البناء.|Inicia sesión en el jugador único para usar el agente.|Connectez-vous au jeu solo pour utiliser l’agent.|Melde dich im Einzelspieler an, um den Build-Agenten zu nutzen.|Entre no jogador único para usar o agente.|Accedi al giocatore singolo per usare l’agente.|Log in bij singleplayer om de bouwagent te gebruiken.|Войдите в одиночную игру, чтобы пользоваться агентом.|Derleme ajanını kullanmak için tek oyuncu moduna giriş yapın.|बिल्ड एजेंट इस्तेमाल करने के लिए सिंगल प्लेयर में साइन इन करें।|ビルドエージェントを使うにはシングルプレイにログインしてください。|빌드 에이전트를 쓰려면 싱글 플레이로 로그인하세요.|要使用构建代理，请登录单人游戏。|Masuk ke single player untuk memakai agen build.|بلا ایجنٹ استعمال کرنے کے لیے سنگل پلیئر میں سائن اِن کریں۔
agentPlaceholder|e.g. add a streak counter to the profile page, and show it in every language|مثال: أضف عدّادًا متتاليًا إلى صفحة الملف الشخصي واعرضه بكل لغة|p. ej. añade un contador de racha al perfil y muéstralo en todos los idiomas|p. ex. ajoutez un compteur de série à la page profil et affichez-le dans toutes les langues|z. B. Füge der Profilseite einen Serienzähler hinzu und zeige ihn in allen Sprachen|ex.: adicione um contador de sequência ao perfil e mostre em todos os idiomas|es. aggiungi un contatore di serie alla pagina profilo e mostralo in ogni lingua|bijv. voeg een reeksenteller toe aan de profielpagina, in alle talen|например: добавить счётчик серии на страницу профиля и показать на всех языках|örn. profil sayfasına seri sayacı ekle ve tüm dillerde göster|जैसे: प्रोफ़ाइल पेज पर स्ट्रीक काउंटर जोड़ें, और हर भाषा में दिखाएँ|例：プロフィールページに連続達成カウンターを追加し、すべての言語で表示する|예: 프로필 페이지에 연속 달성 카운터를 추가하고 모든 언어에 표시|例如：在个人资料页加上连胜计数器，并用所有语言显示|mis. tambahkan penghitung beruntun ke halaman profil, dan tampilkan di semua bahasa|مثلاً: ایک اسٹریک کاؤنٹر پروفائل صفحے پر شامل کریں، اور ہر زبان میں دکھائیں
agentPlan|Plan the change|خطّط التغيير|Planificar el cambio|Planifier le changement|Änderung planen|Planejar a mudança|Pianifica la modifica|Wijziging plannen|Запланировать изменение|Değişikliği planla|बदलाव की योजना बनाएँ|変更を計画する|변경 계획하기|规划改动|Rencanakan perubahan|تبدیلی کا منصوبہ بنائیں
agentDiscard|Discard|تجاهل|Descartar|Abandonner|Verwerfen|Descartar|Scarta|Weggooien|Отменить|Vazgeç|रद्द करें|破棄する|취소|丢弃|Buang|مسترد کریں
agentSayMore|Describe the change in a sentence or two.|صف التغيير في جملة أو جملتين.|Describe el cambio en una o dos frases.|Décrivez le changement en une ou deux phrases.|Beschreibe die Änderung in ein oder zwei Sätzen.|Descreva a mudança em uma ou duas frases.|Descrivi la modifica in una o due frasi.|Beschrijf de wijziging in een of twee zinnen.|Опишите изменение в одном-двух предложениях.|Değişikliği bir iki cümleyle tarif et.|बदलाव को एक-दो वाक्यों में बताएँ।|変更を一言两句で説明してください。|변경 내용을 한두 문장으로 설명하세요.|用一两句话描述这项改动。|Jelaskan perubahan dalam satu atau dua kalimat.|تبدیلی ایک دو جملوں میں بیان کریں۔
agentBusy|The free models are resting. Try again in a little while.|النماذج المجانية مرهقة. حاول بعد قليل.|Los modelos gratuitos descansan. Inténtalo en un rato.|Les modèles gratuits se reposent. Réessayez dans un instant.|Die kostenlosen Modelle ruhen sich aus. Versuch es gleich noch einmal.|Os modelos gratuitos estão descansando. Tente daqui a pouco.|I modelli gratuiti sono a riposo. Riprova tra poco.|De gratismodellen rusten even. Probeer het zo nog eens.|Бесплатные модели отдыхают. Попробуйте чуть позже.|Ücretsiz modeller dinleniyor. Birazdan tekrar dene.|मुफ़्त मॉडल आराम कर रहे हैं। थोड़ी देर बाद फिर कोशिश करें।|無料モデルはお休み中です。しばらくしてから試してください。|무료 모델이 쉬고 있어요. 잠시 후에 다시 시도하세요.|免费模型正在休息。过一会儿再试。|Model gratis sedang beristirahat. Coba lagi sebentar lagi.|مفت ماڈل آرام کر رہے ہیں۔ کچھ دیر بعد کوشش کریں۔
agentPlanReady|Here is what I would change.|هذا ما سأغيّره.|Esto es lo que cambiaría.|Voici ce que je changerais.|Das würde ich ändern.|Isto é o que eu mudaria.|Ecco cosa cambierei.|Dit zou ik wijzigen.|Вот что я бы изменил.|Değiştireceklerim.|मैं यह बदलूँगा।|これが変更する内容です。|제가 바꿀 내용입니다.|这是我会改动的内容。|Ini yang akan saya ubah.|یہ ہے جو میں تبدیل کروں گا۔
agentCounts|{create} new, {update} changed, {remove} removed|{create} جديد، {update} معدّل، {remove} محذوف|{create} nuevos, {update} cambiados, {remove} eliminados|{create} nouveaux, {update} modifiés, {remove} supprimés|{create} neu, {update} geändert, {remove} entfernt|{create} novos, {update} alterados, {remove} removidos|{create} nuovi, {update} modificati, {remove} rimossi|{create} nieuw, {update} gewijzigd, {remove} verwijderd|{create} новых, {update} изменено, {remove} удалено|{create} yeni, {update} değişti, {remove} silindi|{create} नए, {update} बदले गए, {remove} हटाए गए|{create} 件追加、{update} 件変更、{remove} 件削除|{create}개 추가, {update}개 변경, {remove}개 삭제|新增 {create}，修改 {update}，删除 {remove}|{create} baru, {update} diubah, {remove} dihapus|{create} نئے، {update} تبدیل شدہ، {remove} ہٹائے گئے
agentRead|Read {n} files|قرأ {n} ملفات|Leyó {n} archivos|A lu {n} fichiers|Hat {n} Dateien gelesen|Leu {n} arquivos|Ha letto {n} file|{n} bestanden gelezen|Прочитано файлов: {n}|{n} dosya okundu|{n} फ़ाइलें पढ़ीं|{n} 件のファイルを読みました|{n}개 파일을 읽음|读取了 {n} 个文件|Membaca {n} berkas|{n} فائلیں پڑھی گئیں
agentCreated|New|جديد|Nuevo|Nouveau|Neu|Novo|Nuovo|Nieuw|Новый|Yeni|नया|新規|신규|新增|Baru|نیا
agentChanged|Changed|معدّل|Cambiado|Modifié|Geändert|Alterado|Modificato|Gewijzigd|Изменён|Değişti|बदला|変更|변경|修改|Diubah|تبدیل شدہ
agentDeleted|Removed|محذوف|Eliminado|Supprimé|Entfernt|Removido|Rimosso|Verwijderd|Удалён|Silindi|हटाया|削除|삭제|删除|Dihapus|ہٹایا گیا
agentDeleteWarn|{path} will be deleted from your project.|سيُحذف {path} من مشروعك.|Se eliminará {path} de tu proyecto.|{path} sera supprimé du projet.|{path} wird aus deinem Projekt entfernt.|{path} será removido do seu projeto.|{path} sarà rimosso dal progetto.|{path} wordt uit je project verwijderd.|{path} будет удалён из проекта.|{path} projenizden silinecek.|{path} आपके प्रोजेक्ट से हटाया जाएगा।|{path} をプロジェクトから削除します。|{path} 을(를) 프로젝트에서 삭제합니다.|将从你的项目中删除 {path}。|{path} akan dihapus dari proyek Anda.|{path} پروجیکٹ سے حذف ہوگا۔
agentNoChanges|Nothing to change for that. Try being more specific about what you want.|لا شيء لتغييره. حاول أن تكون أكثر تحديدًا لما تريد.|No hay nada que cambiar. Prueba a ser más específico.|Rien à changer. Essayez d’être plus précis.|Nichts zu ändern. Versuch, genauer zu sein.|Nada a alterar. Seja mais específico.|Nulla da modificare. Sii più specifico.|Niets te wijzigen. Wees specifieker.|Нечего менять. Попробуйте сформулировать точнее.|Değiştirilecek bir şey yok. Daha belirgin olun.|बदलने के लिए कुछ नहीं है। थोड़ा और स्पष्ट बताएँ।|変更する対象がありません。もう少し具体的にしてください。|변경할 것이 없습니다. 좀 더 구체적으로 알려주세요.|没有需要改动的内容。试着说得更具体一些。|Tidak ada yang perlu diubah. Coba lebih spesifik.|تبدیل کے لیے کچھ نہیں۔ تھوڑا واضح کہیں۔
agentDeleteConfirm|{n} file will be deleted. That is separate from the changes above, and it cannot be undone from here.|سيُحذف {n} ملف. هذا منفصل عن التغييرات أعلاه ولا يمكن التراجع عنه من هنا.|Se eliminará {n} archivo. Es aparte de los cambios de arriba y no se puede deshacer desde aquí.|{n} fichier sera supprimé. C’est distinct des changements ci-dessus et irréversible depuis ici.|{n} Datei wird gelöscht. Das ist getrennt von den Änderungen oben und von hier nicht rückgängig zu machen.|{n} arquivo será removido. Isso é separado das mudanças acima e não pode ser desfeito daqui.|{n} file sarà rimosso. È separato dalle modifiche qui sopra e non è annullabile da qui.|{n} bestand wordt verwijderd. Dat staat los van de wijzigingen hierboven en kan hier niet ongedaan gemaakt worden.|{n} файл будет удалён. Это отдельно от изменений выше, и отменить здесь нельзя.|{n} dosya silinecek. Bu, yukarıdaki değişikliklerden ayrıdır ve buradan geri alınamaz.|{n} फ़ाइल हटा दी जाएगी। यह ऊपर के बदलावों से अलग है और यहाँ से वापस नहीं लाया जा सकता।|{n} 件のファイルを削除します。上の変更とは別で、ここから元に戻せません。|{n}개 파일을 삭제합니다. 위의 변경과 별개이며 여기서 되돌릴 수 없습니다.|将删除 {n} 个文件。这与上面的改动是分开的，且无法在此撤销。|{n} berkas akan dihapus. Ini terpisah dari perubahan di atas dan tidak bisa dibatalkan dari sini.|{n} فائل حذف ہوگی۔ یہ اوپر کی تبدیلیوں سے الگ ہے اور یہاں سے واپس نہیں ہو سکتی۔
agentApply|Write {n} changes|اكتب {n} تغييرات|Escribir {n} cambios|Écrire {n} modifications|{n} Änderungen schreiben|Escrever {n} alterações|Scrivi {n} modifiche|{n} wijzigingen schrijven|Записать изменений: {n}|{n} değişikliği yaz|{n} बदलाव लिखें|{n} 件の変更を書き込む|{n}개 변경 사항 기록|写入 {n} 项改动|Tulis {n} perubahan|{n} تبدیلیاں لکھیں
agentApplyNote|Only the ticked ones, and only once.|المحدَّد فقط، ومرة واحدة.|Solo las marcadas, y solo una vez.|Seulement celles cochées, et une seule fois.|Nur die angehakten, und nur einmal.|Apenas as marcadas, e apenas uma vez.|Solo quelle spuntate, e una sola volta.|Alleen de aangevinkte, en maar één keer.|Только отмеченные, и только один раз.|Yalnızca işaretlenenler, bir kez.|केवल चुनी हुई, और केवल एक बार।|チェックしたものだけ、一回だけ。|체크한 것만, 한 번만.|仅勾选的项，且只写入一次。|Hanya yang dicentang, dan hanya sekali.|صرف منتخب کردہ، اور صرف ایک بار۔
agentWrote|Wrote {n} files|كُتبت {n} ملفات|Se escribieron {n} archivos|{n} fichiers écrits|{n} Dateien geschrieben|{n} arquivos escritos|Scritti {n} file|{n} bestanden geschreven|Записано файлов: {n}|{n} dosya yazıldı|{n} फ़ाइलें लिखी गईं|{n} 件のファイルを書き込みました|{n}개 파일을 기록했습니다|已写入 {n} 个文件|{n} berkas ditulis|{n} فائلیں لکھی گئیں
agentAfterWrite|Your dev server will pick these up. Run tsc and the tests before you commit.|سيتلقى خادم التطوير هذه التغييرات. شغّل tsc والاختبارات قبل الالتزام.|Tu servidor de desarrollo los tomará. Ejecuta tsc y las pruebas antes de confirmar.|Votre serveur de développement les prendra. Lancez tsc et les tests avant de valider.|Dein Dev-Server übernimmt sie. Führe tsc und die Tests aus, bevor du committest.|Seu servidor de desenvolvimento vai pegá-los. Rode tsc e os testes antes de commitar.|Il tuo dev server le prenderà. Esegui tsc e i test prima di committare.|Je dev-server neemt ze over. Draai tsc en de tests voordat je commit.|Ваш сервер разработки подхватит их. Запустите tsc и тесты перед коммитом.|Geliştirme sunucun bunları alacak. Commit’ten önce tsc ve testleri çalıştır.|आपका डेव सर्वर इन्हें ले लेगा। कमिट से पहले tsc और टेस्ट चलाएँ।|開発サーバーが読み込みます。コミットする前に tsc とテストを実行してください。|개발 서버가 이를 가져갑니다. 커밋하기 전에 tsc와 테스트를 실행하세요.|开发服务器会自动加载。提交前请运行 tsc 和测试。|Server dev Anda akan mengambilnya. Jalankan tsc dan tes sebelum commit.|آپ کا ڈیولپر سرور انہیں لے لےگا۔ کمیٹ سے پہلے tsc اور ٹیسٹ چلائیں۔
agentAfterCommit|Each change is a commit. Edge functions are not redeployed automatically.|كل تغيير هو التزام واحد. لا تُنشر دوال الحافة تلقائيًا.|Cada cambio es un commit. Las funciones de borde no se redeployan solas.|Chaque modification est un commit. Les fonctions edge ne sont pas redéployées.|Jede Änderung ist ein Commit. Edge Functions werden nicht neu ausgerollt.|Cada mudança é um commit. Funções de borda não são republicadas.|Ogni modifica è un commit. Le edge function non vengono ripubblicate.|Elke wijziging is een commit. Edge functions worden niet opnieuw uitgezet.|Каждое изменение — отдельный коммит. Серверные функции не разворачиваются сами.|Her değişiklik bir commit. Edge fonksiyonları otomatik yeniden dağıtılmaz.|हर बदलाव एक कमिट है। एज फ़ंक्शन अपने आप रीडिप्लॉय नहीं होते।|変更ごとにコミットされます。エッジ関数は自動では再配置されません。|변경마다 커밋됩니다. 엣지 함수는 자동으로 다시 배포되지 않습니다.|每次改动都是一个提交。边缘函数不会自动重新部署。|Setiap perubahan adalah satu commit. Edge function tidak otomatis dideploy ulang.|ہر تبدیلی ایک commit ہے۔ ایج فنکشنز خودکار طور پر دوبارہ deploy نہیں ہوتے۔
agentBoundaries|What it will not touch|ما لن يلمسه|Lo que no tocará|Ce qu’il ne touchera pas|Was es nicht anfasst|O que ele não toca|Cosa non toccherà|Wat het niet aanraakt|Чего он не коснётся|Dokunmayacağı şeyler|यह इन्हें नहीं छुएगा|触れないもの|건드리지 않는 것|不会触碰的内容|Yang tidak akan disentuh|جو نہیں چھوئے گا
agentRoots|May write:|يكتب في:|Puede escribir en:|Peut écrire dans :|Darf schreiben in:|Pode escrever em:|Può scrivere in:|Mag schrijven in:|Может писать в:|Şunlara yazabilir:|इनमें लिख सकता है:|書ける場所:|쓸 수 있는 곳:|可写入：|Dapat menulis di:|یہاں لکھ سکتا ہے:
agentNever|Never writes:|لا يكتب أبدًا:|Nunca escribe:|N’écrit jamais :|Schreibt niemals:|Nunca escreve:|Non scrive mai:|Schrijft nooit:|Никогда не пишет:|Asla yazmaz:|कभी नहीं लिखता:|決して書かないもの:|쓰지 않는 것:|绝不写入：|Tidak pernah menulis:|کبھی نہیں لکھتا:
agentSecrets|Refuses content containing:|يرفض المحتوى الذي يحتوي على:|Rechaza contenido con:|Refuse le contenu contenant :|Lehnt Inhalte ab mit:|Recusa conteúdo com:|Rifiuta contenuti con:|Weigt inhoud af met:|Отклоняет содержимое с:|Şunları içeren içeriği reddeder:|इनसे युक्त सामग्री अस्वीकार करता है:|次を含む内容を拒否:|다음이 포함된 내용을 거부:|拒绝包含以下内容：|Menolak konten yang memuat:|یہ مواد ہٹاتا ہے:
agentBridgeLive|Local bridge running|الجسر المحلي يعمل|Puente local en marcha|Pont local actif|Lokale Brücke läuft|Ponte local no ar|Ponte locale attivo|Lokale brug draait|Локальный мост работает|Yerel köprü çalışıyor|स्थानीय ब्रिज चल रहा है|ローカルブリッジが稼働中|로컬 브리지 실행 중|本地桥接已启动|Jembatan lokal berjalan|مقامی پل چل رہا ہے
agentBridgeNote|The agent reads and writes your working tree, so your dev server picks changes up at once. Nothing is committed — commit them yourself when you are happy.|يقرأ الوكيل شجرة العمل ويكتب فيها، فيتلقى خادم التطوير التغييرات فورًا. لا شيء يُلتزم — التزم أنت حين ترضى.|El agente lee y escribe en tu proyecto, así que tu servidor de desarrollo lo toma de inmediato. No se hace commit: hazlo tú cuando estés conforme.|L’agent lit et écrit dans votre projet, donc votre serveur de dev le prend immédiatement. Rien n’est commité — commitez vous-même quand vous êtes satisfait.|Der Agent liest und schreibt in deinem Projekt, dein Dev-Server übernimmt es sofort. Es wird nichts committet — committe selbst, wenn du zufrieden bist.|O agente lê e escreve no seu projeto, então o servidor de dev pega na hora. Nada é commitado — faça você quando estiver satisfeito.|L’agente legge e scrive nel tuo progetto, quindi il dev server lo rileva subito. Nulla viene committato — fallo tu quando sei soddisfatto.|De agent leest en schrijft in je project, dus je dev-server neemt het meteen over. Er wordt niets gecommit — doe dat zelf als je tevreden bent.|Агент читает и пишет в вашем проекте, поэтому сервер разработки подхватит сразу. Ничего не коммитится — закоммитьте сами, когда будете довольны.|Ajan projenizi okur ve yazar, geliştirme sunucunuz değişiklikleri hemen alır. Hiçbir şey commit edilmez — memnun olduğunuzda siz commit edin.|एजेंट आपकी प्रोजेक्ट पढ़ता और लिखता है, इसलिए आपका डेव सर्वर तुरंत ले लेगा। कुछ भी commit नहीं होता — संतुष्ट होने पर आप खुद commit करें।|エージェントは作業ツリーを読み書きするので、開発サーバーがすぐ反映します。何もコミットされません — 満足したら自分でコミットしてください。|에이전트가 작업 트리를 읽고 쓰므로 개발 서버가 바로 반영합니다. 아무것도 커밋되지 않으니 만족하면 직접 커밋하세요.|代理会直接读写你的工作区，开发服务器立刻生效。不会自动提交——满意后请自行提交。|Agen membaca dan menulis di proyek Anda, jadi server dev langsung mengambilnya. Tidak ada yang di-commit — lakukan sendiri saat Anda puas.|ایجنٹ آپ کا ورک ٹری پڑھتا اور لکھتا ہے، اس لیے ڈیولپر سرور فوراً لے لےگا۔ کچھ commit نہیں ہوتا — مطمئن ہونے پر خود commit کریں۔
agentGithubLive|GitHub access configured|تم إعداد الوصول إلى GitHub|Acceso a GitHub configurado|Accès GitHub configuré|GitHub-Zugriff eingerichtet|Acesso ao GitHub configurado|Accesso a GitHub configurato|GitHub-toegang ingesteld|Доступ к GitHub настроен|GitHub erişimi ayarlı|GitHub पहुँच कॉन्फ़िगर है|GitHub アクセスが設定済み|GitHub 액세스 설정됨|已配置 GitHub 访问|Akses GitHub dikonfigurasi|GitHub تک رسائی ترتیب دی گئی
agentNoRoute|No way to reach your files yet, so nothing can be written. Start it with npm run agent:serve, or set a GitHub token in the platform secrets. The agent still plans and shows you every change first.|لا توجد طريقة للوصول إلى ملفاتك بعد، لذا لا يمكن كتابة أي شيء. شغّل npm run agent:serve أو ضع رمز GitHub في أسرار المنصة. يظل الوكيل يخطّط ويعرض كل تغيير أولًا.|Aún no hay forma de llegar a tus archivos, así que no se puede escribir nada. Inicia npm run agent:serve o define un token de GitHub en los secretos de la plataforma. El agente sigue planificando y te muestra cada cambio primero.|Pas encore aucun accès à vos fichiers, donc rien ne peut être écrit. Lancez npm run agent:serve, ou définissez un jeton GitHub dans les secrets de la plateforme. L’agent continue de planifier et de vous montrer chaque changement.|Noch kein Zugriff auf deine Dateien, also kann nichts geschrieben werden. Starte npm run agent:serve oder setze ein GitHub-Token in den Plattform-Secrets. Der Agent plant weiterhin und zeigt dir jede Änderung zuerst.|Aún no hay forma de llegar a tus archivos, así que no se puede escribir nada. Ejecuta npm run agent:serve o define un token de GitHub en los secretos de la plataforma. El agente sigue planificando y te muestra cada cambio primero.|Non c’è ancora un modo per raggiungere i tuoi file, quindi non si può scrivere nulla. Avvia npm run agent:serve o imposta un token GitHub nei segreti della piattaforma. L’agente continua a pianificare e ti mostra ogni modifica.|Nog geen manier om je bestanden te bereiken, dus er kan niets geschreven worden. Start npm run agent:serve of zet een GitHub-token in de platformgeheimen. De agent blijft plannen en toont elke wijziging eerst.|Пока нет способа добраться до ваших файлов, поэтому записать ничего нельзя. Запустите npm run agent:serve или задайте токен GitHub в секретах платформы. Агент по-прежнему планирует и сначала показывает каждое изменение.|Dosyalarınıza henüz erişim yok, bu yüzden hiçbir şey yazılamaz. npm run agent:serve çalıştırın ya da platform sırlarına bir GitHub jetonu koyun. Ajan yine de planlar ve her değişikliği önce sana gösterir.|अभी आपकी फ़ाइलों तक पहुँच नहीं है, इसलिए कुछ भी लिखा नहीं जा सकता। npm run agent:serve चलाएँ, या प्लेटफ़ॉर्म सीक्रेट्स में GitHub टोकन रखें। एजेंट फिर भी योजना बनाता है और हर बदलाव पहले दिखाता है।|まだファイルにアクセスできないため、何も書き込めません。npm run agent:serve を起動するか、プラットフォームのシークレットに GitHub トークンを設定してください。エージェントは計画を作り、先にすべての変更を表示します。|아직 파일에 접근할 수 없어 아무것도 쓸 수 없습니다. npm run agent:serve를 실행하거나 플랫폼 시크릿에 GitHub 토큰을 넣으세요. 에이전트는 계속 계획하고 모든 변경을 먼저 보여줍니다.|还没有访问文件的方式，因此无法写入任何内容。请运行 npm run agent:serve，或在平台机密中设置 GitHub 令牌。代理仍会先规划并把每项改动展示给你。|Belum ada cara menjangkau berkas Anda, jadi tidak ada yang bisa ditulis. Jalankan npm run agent:serve, atau pasang token GitHub di rahasia platform. Agen tetap merencanakan dan menampilkan setiap perubahan lebih dulu.|ابھی آپ کی فائلوں تک رسائی نہیں، اس لیے کچھ بھی لکھا نہیں جا سکتا۔ npm run agent:serve چلائیں، یا پلیٹ فارم سیکریٹس میں GitHub ٹوکن رکھیں۔ ایجنٹ پھر بھی منصوبہ بناتا ہے اور ہر تبدیلی پہلے دکھاتا ہے۔
agentInstruction|What should change?|ما الذي يجب أن يتغير؟|¿Qué debería cambiar?|Que doit changer ?|Was soll sich ändern?|O que deve mudar?|Cosa dovrebbe cambiare?|Wat moet er veranderen?|Что должно измениться?|Ne değişmeli?|क्या बदलना चाहिए?|何を変更しますか？|무엇을 바꿔야 하나요?|应该改动什么？|Apa yang harus berubah?|کیا تبدیل ہونا چاہیے؟
agentDropped|{n} suggestions were refused — a path outside the source folders, a file type it does not write, or something that looked like a credential.|رُفضت {n} اقتراحات — مسار خارج مجلدات المصدر، أو نوع ملف لا يكتبه، أو شيء يشبه بيانات اعتماد.|Se rechazaron {n} sugerencias: una ruta fuera de las carpetas del proyecto, un tipo de archivo que no escribe, o algo que parecía una credencial.|{n} suggestions refusées : un chemin hors des dossiers du projet, un type de fichier qu’il n’écrit pas, ou quelque chose qui ressemblait à un identifiant.|{n} Vorschläge abgelehnt: ein Pfad außerhalb der Quellordner, ein Dateityp den er nicht schreibt, oder etwas, das wie ein Zugangsschlüssel aussah.|{n} sugestões recusadas: um caminho fora das pastas do projeto, um tipo de ficheiro que ele não escreve, ou algo que parecia uma credencial.|{n} suggerimenti rifiutati: un percorso fuori dalle cartelle del progetto, un tipo di file che non scrive, o qualcosa che sembrava una credenziale.|{n} suggesties geweigerd: een pad buiten de bronmappen, een bestandstype dat hij niet schrijft, of iets dat op een inloggegeven leek.|Отклонено предложений: {n} — путь вне исходных папок, тип файла, который он не пишет, или что-то, похожее на учётные данные.|{n} öneri reddedildi: kaynak klasörleri dışındaki bir yol, yazmadığı bir dosya türü veya kimlik bilgisi gibi görünen bir şey.|{n} सुझाव अस्वीकार किए गए — स्रोत फ़ोल्डर के बाहर का पथ, ऐसी फ़ाइल जिसे यह नहीं लिखता, या कुछ जो क्रेडेंशियल जैसा लगा।|{n} 件の提案は却下されました — ソースフォルダ外のパス、書き込まないファイル形式、または資格情報のように見えたもの。|제안 {n}건이 거부되었습니다 — 소스 폴더 밖의 경로, 작성하지 않는 파일 형식, 또는 자격 증명처럼 보이는 내용입니다.|已拒绝 {n} 条建议：源文件夹之外的路径、它不写入的文件类型，或看起来像凭据的内容。|{n} usulan ditolak — jalur di luar folder sumber, jenis berkas yang tidak ditulisnya, atau sesuatu yang tampak seperti kredensial.|{n} تجاویز رد کی گئیں — سورس فولڈرز سے باہر کا راستہ، ایسا فائل قسم جو یہ نہیں لکھتا، یا کچھ جو اسناد جیسا لگا۔
agentCapacity|{left} of {of} AI requests left today, across {n} provider(s)|{left} من {of} طلب ذكاء اصطناعي متبقٍ اليوم، عبر {n} مزوّد|{left} de {of} peticiones de IA quedan hoy, en {n} proveedor(es)|{left} requêtes IA sur {of} restantes aujourd’hui, via {n} fournisseur(s)|Heute noch {left} von {of} KI-Anfragen, über {n} Anbieter|Restam {left} de {of} pedidos de IA hoje, em {n} provedor(es)|Restano {left} di {of} richieste IA oggi, su {n} fornitori|Vandaag nog {left} van {of} AI-verzoeken, over {n} aanbieder(s)|Сегодня осталось {left} из {of} запросов к ИИ, через {n} провайдеров|Bugün {of} yapay zekâ isteğinden {left} tanesi kaldı, {n} sağlayıcı üzerinden|आज {of} में से {left} AI अनुरोध शेष, {n} प्रदाता के माध्यम से|本日は {of} 件中 {left} 件のAIリクエストが残っています（{n} 社）|오늘 AI 요청 {of}건 중 {left}건 남음, 제공자 {n}곳|今天还剩 {of} 中的 {left} 个 AI 请求，来自 {n} 个提供方|Tersisa {left} dari {of} permintaan AI hari ini, melalui {n} penyedia|آج {of} میں سے {left} AI درخواست باقی ہے، {n} فراہم کنندہ کے ذریعے
agentLeft|{n} left|بقي {n}|quedan {n}|{n} restant|noch {n}|restam {n}|ne {n}|nog {n}|осталось {n}|{n} kaldı|{n} शेष|残り {n}|{n}개 남음|剩余 {n}|tersisa {n}|{n} باقی
agentSpent|spent|مستنفد|agotado|épuisé|aufgebraucht|esgotado|esaurito|op|исчерпан|tükendi|ख़त्म|上限|소진|已用尽|habis|خراب ہوا
agentNoKey|no key|بلا مفتاح|sin clave|sans clé|kein Schlüssel|sem chave|nessuna chiave|geen sleutel|нет ключа|anahtar yok|कुंजी नहीं|キーなし|키 없음|未配置|tanpa kunci|کلید نہیں
agentCapacityNote|No provider is unlimited. Each has a published cap, and the router spends whichever has the most headroom left - so one running out does not stop the app, and adding a free key raises the ceiling rather than redistributing the same fifty requests.|لا مزوّد غير محدود. لكل مزوّد سقف معلن، ويستخدم الموجّه المزوّد صاحب أكبر رصيد متبقٍ — لذا لا يوقف نفاد أحدهم التطبيق، وإضافة مفتاح مجاني يرفع السقف بدلًا من إعادة توزيع الخمسين طلبًا نفسها.|Ningún proveedor es ilimitado. Cada uno tiene un tope publicado, y el enrutador usa el que tenga más margen - así que agotarse uno no detiene la app, y añadir una clave gratuita sube el techo en lugar de redistribuir las mismas cincuenta peticiones.|Aucun fournisseur n’est illimité. Chacun a un plafond publié, et le routeur utilise celui qui a le plus de marge - la saturation de l’un n’arrête donc pas l’application, et ajouter une clé gratuite augmente le plafond au lieu de redistribuer les mêmes cinquante requêtes.|Kein Anbieter ist unbegrenzt. Jeder hat eine veröffentlichte Obergrenze, und der Router nutzt den mit dem meisten Rest - ist einer leer, läuft die App weiter, und ein kostenloser Schlüssel hebt die Grenze an, statt dieselben fünfzig Anfragen umzuverteilen.|Nenhum provedor é ilimitado. Cada um tem um teto publicado, e o roteador usa o que tiver mais folga - então um esgotar não para o app, e adicionar uma chave gratuita aumenta o teto em vez de redistribuir as mesmas cinquenta requisições.|Nessun provider è illimitato. Ognuno ha un tetto pubblicato e il router usa quello con più margine - esaurirne uno non ferma l’app, e aggiungere una chiave gratuita alza il tetto invece di ridistribuire le stesse cinquanta richieste.|Geen aanbieder is onbeperkt. Elk heeft een gepubliceerde bovengrens, en de router gebruikt degene met de meeste ruimte - dus een opgebruikte aanbieder stopt de app niet, en een gratis sleutel verhoogt de grens in plaats van dezelfde vijftig verzoeken te herverdelen.|Ни один провайдер не безграничен. У каждого есть опубликованный предел, и маршрутизатор берёт того, у кого больше осталось — поэтому исчерпание одного не останавливает приложение, а бесплатный ключ повышает потолок, а не перераспределяет те же пятьдесят запросов.|Hiçbir sağlayıcı sınırsız değil. Her birinin yayımlanmış bir tavanı var ve yönlendirici en çok payı kalanı kullanır — biri tükenince uygulama durmaz, ücretsiz bir anahtar eklemek aynı elli isteği yeniden dağıtmak yerine tavanı yükseltir.|कोई प्रदाता असीमित नहीं है। हर एक की प्रकाशित सीमा होती है, और राउटर जिसके पास सबसे अधिक शेष हो उसका उपयोग करता है — इसलिए एक समाप्त होने पर ऐप बंद नहीं होता, और मुफ़्त कुंजी जोड़ने से वही पचास अनुरोध दोबारा बाँटने के बजाय सीमा बढ़ती है।|無制限のプロバイダーはありません。いずれも公開された上限があり、ルーターは残り余地が最もあるプロバイダーを使用します。いずれかの上限に達してもアプリは止まらず、無料キーを追加すれば同じ50件を配り直すのではなく上限が伸びます。|무제한 제공자는 없습니다. 각 제공자마다 공개된 한도가 있고, 라우터는 여유가 가장 많은 곳을 사용합니다 - 그래서 하나가 소진되어도 앱이 멈추지 않으며, 무료 키를 추가하면 같은 50건을 다시 나누어 쓰는 대신 한도가 늘어납니다.|没有提供商是无限的。每个都有公开的上限，路由器会优先使用余量最多的那一个——所以某个用尽时应用不会停，添加免费密钥会提高上限，而不是把同样的五十次请求重新分配。|Tidak ada penyedia yang tak terbatas. Semuanya punya batas resmi, dan router memakai yang paling sisa Capacity dayanya - jadi satu habis tidak menghentikan aplikasi, dan kunci gratis menaikkan batasnya alih-alih redistribute lima puluh permintaan yang sama.|کوئی فراہم کنندہ بے حد نہیں۔ ہر ایک کی اعلان شدہ حد ہے، اور روٹر ان میں سے اس کا استعمال کرتا ہے جس کے پاس سب سے زیادہ باقی ہو — اس لیے ایک کے ختم ہونے پر ایپ بند نہیں ہوتی، اور مفت کلید شامل کرنے سے وہی پچاس درخواستیں دوبارہ بانٹنے کے بجائے حد بڑھ جاتی ہے۔
oneAtATime|One mode at a time|وضع واحد في كل مرة|Un modo a la vez|Un mode à la fois|Ein Modus zur Zeit|Um modo de cada vez|Una modalità alla volta|Eén modus tegelijk|Один режим за раз|Her seferinde bir mod|एक बार में एक मोड|一度に一つのモード|한 번에 한 가지 모드|一次只能使用一种模式|Satu mode pada satu waktu|ایک وقت میں ایک موڈ
signedInSolo|You are signed in to Single player|أنت مسجل الدخول في اللعب الفردي|Has iniciado sesión en el jugador único|Vous êtes connecté au jeu solo|Du bist im Einzelspieler angemeldet|Você está com sessão iniciada no jogador único|Hai effettuato l’accesso al giocatore singolo|Je bent ingelogd bij singleplayer|Вы вошли в одиночную игру|Tek oyuncu modunda oturum açtınız|आप सिंगल प्लेयर में साइन इन हैं|シングルプレイでログインしています|싱글 플레이로 로그인되어 있습니다|你已登录单人游戏|Anda masuk ke mode single player|آپ سنگل پلیئر میں سائن اِن ہیں
signedInArena|You are signed in to Multiplayer|أنت مسجل الدخول في اللعب المتعدد|Has iniciado sesión en el multijugador|Vous êtes connecté au multijoueur|Du bist im Mehrspieler angemeldet|Você está com sessão iniciada no multijogador|Hai effettuato l’accesso al multigiocatore|Je bent ingelogd bij multiplayer|Вы вошли в мультиплеер|Çok oyunculu modunda oturum açtınız|आप मल्टीप्लेयर में साइन इन हैं|マルチプレイでログインしています|멀티 플레이로 로그인되어 있습니다|你已登录多人游戏|Anda masuk ke mode multipemain|آپ ملٹی پلیئر میں سائن اِن ہیں
switchModeDesc|Single player and multiplayer are separate accounts. Sign out of one to use the other.|اللعب الفردي واللعب المتعدد حسابان منفصلان. سجّل الخروج من أحدهما لاستخدام الآخر.|El jugador único y el multijugador son cuentas distintas. Cierra sesión en una para usar la otra.|Le jeu solo et le multijoueur sont des comptes distincts. Déconnectez-vous de l’un pour utiliser l’autre.|Einzelspieler und Mehrspieler sind getrennte Konten. Melde dich von einem ab, um das andere zu nutzen.|O jogador único e o multijogador são contas separadas. Saia de uma para usar a outra.|Giocatore singolo e multigiocatore sono account separati. Esci da uno per usare l’altro.|Singleplayer en multiplayer zijn aparte accounts. Log uit bij het ene om het andere te gebruiken.|Одиночная игра и мультиплеер — разные учётные записи. Выйдите из одной, чтобы войти в другую.|Tek oyuncu ve çok oyunculu mod ayrı hesaplardır. Diğerini kullanmak için birinden çıkış yap.|सिंगल प्लेयर और मल्टीप्लेयर अलग खाते हैं। दूसरे का उपयोग करने के लिए एक से साइन आउट करें।|シングルプレイとマルチプレイは別のアカウントです。どちらかを退出すると、もう一方を利用できます。|싱글 플레이와 멀티 플레이는 별개의 계정입니다. 하나에서 로그아웃하면 다른 쪽을 사용할 수 있습니다.|单人游戏和多人游戏是两个独立的账号。退出一个账号后才能使用另一个。|Single player dan multipemain adalah akun terpisah. Keluar dari salah satu untuk menggunakan yang lain.|سنگل پلیئر اور ملٹی پلیئر الگ حساب ہیں۔ دوسرے استعمال کرنے کے لیے ایک سے سائن آؤٹ کریں۔
signOutFirst|Sign out and continue|سجّل الخروج وتابع|Cerrar sesión y continuar|Se déconnecter et continuer|Abmelden und fortfahren|Sair e continuar|Esci e continua|Uitloggen en doorgaan|Выйти и продолжить|Çıkış yap ve devam et|साइन आउट करके जारी रखें|ログアウトして続ける|로그아웃하고 계속하기|退出并继续|Keluar dan lanjutkan|سائن آؤٹ کریں اور جاری رکھیں
soloAccountOnly|This is your separate Single player account.|هذا حسابك المنفصل للعب الفردي.|Esta es tu cuenta independiente de jugador único.|Voici votre compte distinct pour le jeu solo.|Dies ist dein separates Konto für das Einzelspieler-Spiel.|Esta é a sua conta separada de jogador único.|Questo è il tuo account separato per il giocatore singolo.|Dit is je aparte singleplayer-account.|Это ваш отдельный аккаунт для одиночной игры.|Bu, tek oyuncu moduna ait ayrı hesabınız.|यह आपका अलग सिंगल प्लेयर खाता है।|これはあなたのシングルプレイ専用アカウントです。|이것은 별개의 싱글 플레이 계정입니다.|这是你独立的单人游戏账号。|Ini akun single player terpisah Anda.|یہ آپ کا الگ سنگل پلیئر اکاؤنٹ ہے۔
arenaAccountOnly|This is your separate Multiplayer account.|هذا حسابك المنفصل للعب المتعدد.|Esta es tu cuenta independiente de multijugador.|Voici votre compte distinct pour le multijoueur.|Dies ist dein separates Konto für das Mehrspieler-Spiel.|Esta é a sua conta separada de multijogador.|Questo è il tuo account separato per il multigiocatore.|Dit is je aparte multiplayer-account.|Это ваш отдельный аккаунт для мультиплеера.|Bu, çok oyunculu moda ait ayrı hesabınız.|यह आपका अलग मल्टीप्लेयर खाता है।|これはあなたのマルチプレイ専用アカウントです。|이것은 별개의 멀티 플레이 계정입니다.|这是你独立的多人游戏账号。|Ini akun multipemain terpisah Anda.|یہ آپ کا الگ ملٹی پلیئر اکاؤنٹ ہے۔
digit0|0|٠|0|0|0|0|0|0|0|0|०|〇|영|〇|0|۰
digit1|1|١|1|1|1|1|1|1|1|1|१|一|일|一|1|۱
digit2|2|٢|2|2|2|2|2|2|2|2|२|二|이|二|2|۲
digit3|3|٣|3|3|3|3|3|3|3|3|३|三|삼|三|3|۳
digit4|4|٤|4|4|4|4|4|4|4|4|४|四|사|四|4|۴
digit5|5|٥|5|5|5|5|5|5|5|5|५|五|오|五|5|۵
digit6|6|٦|6|6|6|6|6|6|6|6|६|六|육|六|6|۶
digit7|7|٧|7|7|7|7|7|7|7|7|७|七|칠|七|7|۷
digit8|8|٨|8|8|8|8|8|8|8|8|८|八|팔|八|8|۸
digit9|9|٩|9|9|9|9|9|9|9|9|९|九|구|九|9|۹
numerals|Numerals|الأرقام|Numerales|Chiffres|Ziffern|Numeral|Cifre|Cijfers|Цифры|Rakamlar|अंक|数字の表記|숫자 표기|数字样式|Angka|ہندسے
numeralSmall|Everyday (123)|الأرقام اليومية (١٢٣)|Corriente (123)|Courant (123)|Gebräuchlich (123)|Corrente (123)|Comune (123)|Gewoon (123)|Обычные (123)|Yaygın (123)|सामान्य (१२३)|常用 (一二三)|한자 (일이삼)|小写 (一二三)|Biasa (123)|روزمرہ (۱۲۳)
numeralFinancial|Financial (123)|مالية (١٢٣)|Financiera (123)|Financière (123)|Finanzielle (123)|Financeira (123)|Finanziaria (123)|Financiële (123)|Финансовая (123)|Finansal (123)|वित्तीय (१२३)|大書き (壱弐参)|금융용 (일이삼)|大写 (零壹贰)|Keuangan (123)|مالی (۱۲۳)
numeralKanji|Kanji (123)|كانجي (١٢٣)|Kanji (123)|Kanji (123)|Kanji (123)|Kanji (123)|Kanji (123)|Kanji (123)|Кандзи (123)|Kanji (123)|कंजी (१२३)|漢字 (一二三)|한자 (일이삼)|汉字 (一二三)|Kanji (123)|کانجی (۱۲۳)
numeralFullwidth|Fullwidth (０１２)|أرقام عريضة (١٢٣)|Ancho (０１２)|Pleine largeur (０１２)|Breit (０１２)|Largo (０１２)|A tutta larghezza (０１２)|Volle breedte (０１２)|Полноширинные (０１２)|Geniş (０１２)|पूर्ण चौड़ाई (१२३)|全角 (０１２)|전각 (０１２)|全角 (０１２)|Lebar (０１２)|چوڑا (۱۲۳)
numeralSino|Sino-Korean (123)|صيني-كوري (١٢٣)|Sino-coreano (123)|Sino-coréen (123)|Sino-koreanisch (123)|Sino-coreano (123)|Sino-coreano (123)|Sino-Koreaans (123)|Сино-корейский (123)|Sino-Korece (123)|सिनो-कोरियाई (१२३)|漢字語 (一二三)|한자어 (일이삼)|汉字 (一二三)|Sino-Korea (123)|سینو-کوری (۱۲۳)
numeralNative|Native (123)|أصلية (١٢٣)|Nativa (123)|Native (123)|Nativ (123)|Nativa (123)|Nativa (123)|Inheems (123)|Родные (123)|Yerel (123)|मातृ (१२३)|和語 (ひとつ)|고유어 (하나둘셋)|本土 (一二三)|Asli (123)|مقامی (۱۲۳)
`;
export const translations: Record<string,Record<string,string>> = Object.fromEntries(languages.map(l=>[l.code,{}]));
for (const line of rows.trim().split('\n')) { const [key,...values] = line.split('|'); languages.forEach((l,i)=>{translations[l.code][key]=values[i]?.replaceAll('\\n','\n') || values[0];}); }

// Digit glyphs are data rather than words, but they are per-locale, so they are
// translated in the table above like every other string.
//
// Arabic and Urdu use the Extended Arabic-Indic digits, drawn from the bundled
// ArabicNumerals subset (see styles.css) because the ordinary Arabic-Indic zero is a
// solid dot in every everyday Arabic typeface, while U+06F0 in that face is a
// hollow ring. The plain block is never displayed but stays accepted on input.
//
// Chinese, Japanese and Korean get their own characters rather than fullwidth Latin
// digits, which is what those three languages actually write: 零一二三四 in Chinese,
// 〇一二三四 in Japanese, and 영일이삼사 in Sino-Korean. Those glyphs are
// per-position, so they are wrong for anything that counts rather than codes - 90
// levels is 九十, never 九〇 - and the two cases are kept apart by two functions.
// toDigits is positional and is what the code boxes, the keypad, the timers and the
// index labels use; toNumerals reads a run of digits as a number instead.
//
// Group separators and grouping sizes are kept in code, not the table, because two
// of them are invisible characters that would be unmaintainable in a pipe-delimited
// row. Values follow CLDR. The three CJK locales are absent on purpose: they group
// by ten thousand rather than by three, and the cardinal reader below does that.
const ASCII_DIGITS = '0123456789';
// Arabic uses the Eastern Arabic-Indic digits (U+0660-U+0669) and Urdu uses the
// Extended Arabic-Indic digits (U+06F0-U+06F9) that Urdu and Persian use natively.
// Both are drawn from the bundled ArabicNumerals subset, which keeps all ten
// numerals on one advance width so codes and keypads stay in column.
//
// The two zeros differ in shape and only one of them can be changed. U+06F0 in this
// face is a hollow ring; U+0660 is a solid dot, and it is a dot in EVERY Arabic
// typeface that exists - Amiri, Cairo, Scheherazade, Noto Naskh, Noto Nastaliq
// Urdu and thirty more were all measured. Arabic therefore keeps its dot zero,
// which is the correct Eastern Arabic form, and Urdu keeps its ring.
const groupSeparators: Record<string,string> = {
  en: ',', ar: '٬', es: '.', fr: ' ', de: '.', pt: '.', it: '.', nl: '.',
  ru: ' ', tr: '.', hi: ',', id: '.', ur: '٬',
};
// [least-significant group size, size of the remaining groups]. Devanagari counts in
// lakh/crore (12,34,567), everything else groups by threes.
// Arabic pairs Latin digits with a plain comma: the Arabic thousands separator
// (U+066C) belongs with Arabic-Indic digits, and "1٬234" beside Latin digits reads
// as a typo. Urdu keeps U+066C because its digits are Arabic-Indic.
const groupSizes: Record<string,[number,number]> = { hi: [3, 2] };

// A numeral set is addressed as "<locale>" or "<locale>#<register>", so a component
// can pass one value around and still reach an alternate register. The register
// rides along inside the id rather than travelling as a second argument because
// every helper here is a pure function of (value, lang); threading a parameter
// through thirty call sites would have meant thirty chances to forget it.
function splitNumeralId(id:string){
  const at = id.indexOf('#');
  return (at < 0 ? [id,''] : [id.slice(0,at), id.slice(at+1)]) as [string,string];
}

// Each character-numeral language ships a second register, chosen in Settings.
// Chinese has the financial set (大寫, 壹贰叁) that exists so a cheque cannot be
// altered; Japanese can fall back to the fullwidth digits this app shipped before it
// had real ones; Korean has the native set (고유어, 하나 둘 셋) that counts objects.
// Kept in code rather than in the table because a register is an alternate spelling
// of one script, not a sixteenth parallel translation, and most of the columns would
// be empty.
//
// A register is one of three things, and the difference matters. Counting registers
// carry place words, so a quantity still reads properly in their own spelling.
// Plain registers just write digits, and take the generic separator path. Word
// registers hold counting words rather than digit glyphs, so they cannot be stacked
// into a larger number at all and prose falls back to the language's own cardinals.
// Only Korean is a word register, and it is the case worth spelling out: Korean has
// two numeral systems and mixes them by context. The keypad and the code glyphs count
// objects and take 하나, while quantities take dates, money and mathematics, where
// Korean is unambiguously Sino-Korean. Giving the native register place words would
// only produce hybrids, because native Korean writes 12 as 열둘 and not 십둘 - the
// tens stop at ten and the whole ladder has to change with them - and a keypad is the
// one place where the counting words are unambiguously right.
type Register = { digits:string[]; label:string; plain?:boolean; words?:boolean; places?:[string,string,string] };
const registers: Record<string,Record<string,Register>> = {
  zh: { financial: { digits:['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'], label:'numeralFinancial', places:['拾','佰','仟'] } },
  ja: { fullwidth: { digits:['０','１','２','３','４','５','６','７','８','９'], label:'numeralFullwidth', plain:true } },
  ko: { native:   { digits:['영','하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉'], label:'numeralNative', words:true } },
};
// [register id, translation key] per locale. A locale absent from this table has a
// single numeral set and offers no choice, so the setting is not drawn for it.
const registerOrder: Record<string,string[]> = { zh: ['financial'], ja: ['fullwidth'], ko: ['native'] };
const baseLabels: Record<string,string> = { zh:'numeralSmall', ja:'numeralKanji', ko:'numeralSino' };
/** Registers a locale offers, as [id, translation key] pairs. Empty for the rest. */
export function numeralRegisters(lang:string){
  const alts = registerOrder[lang];
  return alts ? [['', baseLabels[lang]], ...alts.map((id):[string,string] => [id, registers[lang][id].label])] : [];
}

// A digit set is ten glyphs rather than ten characters, because a glyph is not always
// one character: native Korean counts 5 as 다섯 and 7 as 일곱, and a set built as a
// string would hand back the syllables of 하나 as if they were two separate digits.
const ASCII_SET = [...ASCII_DIGITS];
const baseDigits: Record<string,string[]> = {};
for (const l of languages) {
  const row = translations[l.code];
  const set = Array.from({length:10},(_,i)=>row['digit'+i] || ASCII_DIGITS[i]);
  // Every locale that writes plain Latin digits shares one array, which lets
  // toDigits recognise them by identity and return the text untouched.
  baseDigits[l.code] = set.every((g,i)=>g === ASCII_DIGITS[i]) ? ASCII_SET : set;
}
function digitsFor(id:string){
  const [lang, register] = splitNumeralId(id);
  return registers[lang]?.[register]?.digits ?? baseDigits[lang] ?? ASCII_SET;
}

// Accept any supported script on input, not just the active one: a user can paste or
// type digits from any keyboard, and the code field must still yield ASCII. Every
// register of every locale is registered, so a code pasted in its financial Chinese
// spelling - or a Korean one pasted as 하나둘셋 - still parses.
const incomingDigits: Record<string,string> = {};
for (const set of [...Object.values(baseDigits), ...Object.values(registers).flatMap(r=>Object.values(r).map(v=>v.digits))])
  set.forEach((glyph,i)=>{ incomingDigits[glyph] = ASCII_DIGITS[i]; });
for (let i=0;i<10;i++) incomingDigits[ASCII_DIGITS[i]] = ASCII_DIGITS[i];
// Both Arabic-Indic blocks stay accepted on input. Arabic renders U+0660-U+0669 and
// Urdu U+06F0-U+06F9, but the two blocks draw the same glyphs, so content typed or
// pasted in either one still parses no matter which locale is active.
for (let i=0;i<10;i++) incomingDigits[String.fromCharCode(0x06F0+i)] = ASCII_DIGITS[i];
for (let i=0;i<10;i++) incomingDigits[String.fromCharCode(0x0660+i)] = ASCII_DIGITS[i];
// The fullwidth block likewise. It is no longer any locale's own set, but it is what
// Chinese, Japanese and Korean displayed until they gained real digits, so a code
// saved or shared in that spelling still opens.
for (let i=0;i<10;i++) incomingDigits[String.fromCharCode(0xFF10+i)] = ASCII_DIGITS[i];

/** One glyph per digit, in order. Positional: 1234 reads 一二三四, never 一千二百三十四. */
export function toDigits(text:string, id:string){
  const set = digitsFor(id);
  if (set === ASCII_SET) return text;
  let out = '';
  for (const ch of text) out += ch >= '0' && ch <= '9' ? set[ch.charCodeAt(0)-48] : ch;
  return out;
}
// A glyph is not always one character - native Korean writes 5 as 다섯 - so input is
// parsed longest match first, and the candidates are ordered that way once here.
// Without the ordering, 7 pasted as 일곱 would parse as 1 (일) followed by a stray
// syllable, which is worse than not parsing at all.
const incomingOrder = Object.keys(incomingDigits).sort((a,b) => b.length - a.length);
/** Rewrites any supported numeral script back to ASCII, for parsing and validation. */
export function fromNumerals(text:string){
  let out = '', at = 0;
  while (at < text.length) {
    const hit = incomingOrder.find(g => text.startsWith(g, at));
    if (hit) { out += incomingDigits[hit]; at += hit.length; }
    else { out += text[at]; at++; }
  }
  return out;
}

// Chinese and Japanese both count in fours of digits under a ten-thousand multiplier,
// and Sino-Korean does the same with 만, so a quantity is read in groups of four:
// 1234567 is 一百二十三万四千五百六十七, 百二十三万四千五百六十七 and
// 백이십삼만사천오백육백칠십칠. Only these three locales need this; everywhere else a
// number is its digits and a separator.
type Cardinal = {
  ten: string; hundred: string; thousand: string;
  units: string[];    // 10^4, 10^8, 10^12, 10^16
  zero: string;       // filler for a skipped digit inside a group
  gap: string;        // filler for a group that starts short, e.g. 10005 -> 一万零五
  bare: string[];     // places whose leading one is not spoken
  bareUnit: boolean;  // ...and whether the multiplier is one of them
};
const cardinals: Record<string,Cardinal> = {
  zh: { ten:'十', hundred:'百', thousand:'千', units:['万','亿','兆'], zero:'零', gap:'零', bare:['十'],         bareUnit:false },
  // Japanese and Korean drop an interior zero outright: 1001 is 千一 and 천일,
  // never 千零一. Chinese needs both fillers, and is the only one of the three that
  // keeps the leading one before 百 and 千, so its 123 is 一百二十三.
  ja: { ten:'十', hundred:'百', thousand:'千', units:['万','億','兆'], zero:'',  gap:'',  bare:['十','百','千'], bareUnit:true },
  ko: { ten:'십', hundred:'백', thousand:'천', units:['만','억','조'], zero:'',  gap:'',  bare:['십','백','천'], bareUnit:true },
};
/** Reads 1-9999 on its own, e.g. 1042 -> 一千零四十二 / 천사십이. */
function readChunk(n:number, set:string[], c:Cardinal){
  const parts:string[] = []; let gap = false;
  const place = (digit:number, unit:string) => {
    if (digit) { parts.push((parts.length && gap ? c.zero : '') + set[digit] + unit); gap = false; }
    else if (parts.length) gap = true;
  };
  place(Math.floor(n/1000), c.thousand);
  place(Math.floor(n/100)%10, c.hundred);
  place(Math.floor(n/10)%10, c.ten);
  place(n%10, '');
  return parts.join('');
}
/** Reads a whole number the way the language writes one. */
function cardinal(n:number, set:string[], c:Cardinal){
  // Chinese has two zeros and they are not interchangeable: 零 is the number, and
  // 〇 is the digit, so "no levels left" is 零 while a blank code is 〇〇. Japanese
  // and Korean have one each, so the gap filler stands in for the word.
  if (n === 0) return c.zero || set[0];
  // Collect four-digit groups from the least significant end, then read them back
  // from the top, so the leading group is known before it is written.
  const groups:{ chunk:number; tier:number }[] = [];
  for (let rest = n, tier = 0; rest > 0 && tier < c.units.length; tier++) {
    const chunk = rest % 10000;
    if (chunk) groups.push({ chunk, tier });
    rest = Math.floor(rest/10000);
  }
  return groups.reverse().map(({ chunk, tier }, index) => {
    let body = readChunk(chunk, set, c);
    const unit = tier ? c.units[tier-1] : '';
    // Only the leading group drops its one, and only in front of a bare place: 12 is
    // 十二 rather than 一十二, 120 is 百二十 but 一百二十, and 11000 stays 一万一千
    // because the multiplier there is not standing alone. Lower groups keep their
    // one throughout, which is what makes 11000 read as 一万 followed by 一千.
    if (index === 0) {
      const place = chunk >= 1000 ? c.thousand : chunk >= 100 ? c.hundred : chunk >= 10 ? c.ten : unit;
      // A group of one with no multiplier of its own is just the digit 一, and the
      // empty string is not a place, so the multiplier test has to insist on one.
      const bare = !!place && (c.bare.includes(place) || (place === unit && c.bareUnit && groups.length === 1));
      if (bare && body === set[1] && place === unit) body = '';
      else if (bare && body.startsWith(set[1] + place)) body = body.slice(1);
    }
    // A group below the first that begins short leaves a hole, and Chinese names it.
    return (index && chunk < 1000 ? c.gap : '') + body + unit;
  }).join('');
}
/** The locale's cardinal reader and glyphs, or null when it writes plain digits. */
function cardinalOf(id:string){
  const [lang, register] = splitNumeralId(id);
  const base = cardinals[lang];
  const chosen = registers[lang]?.[register];
  if (!base || chosen?.plain) return null;
  // The financial set renames the places along with the digits: 12 is 壹拾贰. A word
  // register has no places at all, so it keeps the locale's cardinals and its glyphs.
  const named = chosen?.places;
  const c = named ? { ...base, ten:named[0], hundred:named[1], thousand:named[2] } : base;
  return [c, chosen?.words ? baseDigits[lang] : digitsFor(id)] as [Cardinal,string[]];
}

/** Rewrites ASCII digits in `text` to the locale's script. Display only. */
export function toNumerals(text:string, id:string){
  const pair = cardinalOf(id);
  // Every other locale writes a number as its own digits, so the run split below
  // would be pure overhead. A run of exactly four is a code, which stays positional
  // even here: 1234 is 一二三四 / 일이삼사, while 123 is 一百二十三.
  if (!pair) return toDigits(text, id);
  return text.replace(/\d+/g, run => run.length === 4 ? toDigits(run, id) : cardinal(Number(run), pair[1], pair[0]));
}
/** Grouped number in the locale's digits, e.g. 1234567 -> "1,234,567" / "12,34,567". */
export function num(value:number|string, id:string){
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return toNumerals(String(value), id);
  const digits = String(Math.abs(n));
  const pair = cardinalOf(id);
  // The CJK locales carry their own grouping, so they never reach the separator.
  // Past the largest unit the reader has, the digits are left positional rather than
  // silently truncated; no balance or score in the app comes close.
  if (pair) return (n < 0 ? '-' : '') + (n < 1e16 ? cardinal(Number(digits), pair[1], pair[0]) : toDigits(digits, id));
  // Separator and group size are per language, so a plain CJK register still reads
  // them off its own locale rather than off the id, which now carries a register.
  const [lang] = splitNumeralId(id);
  const [primary, secondary] = groupSizes[lang] ?? [3, 3];
  const sep = groupSeparators[lang] ?? ',';
  let body: string;
  if (secondary === primary || digits.length <= primary) {
    body = digits.replace(new RegExp(`\\B(?=(\\d{${primary}})+(?!\\d))`,'g'), sep);
  } else {
    const cut = digits.length - primary;
    const head = digits.slice(0, cut).replace(new RegExp(`\\B(?=(\\d{${secondary}})+(?!\\d))`,'g'), sep);
    body = head + sep + digits.slice(cut);
  }
  return (n < 0 ? '-' : '') + toDigits(body, id);
}
/** Zero-padded number in the locale's digits, for level codes, timers and counters. */
export function pad(value:number|string, width:number, id:string){
  return toDigits(String(value).padStart(width,'0'), id);
}

// How each language says a single digit. The keypad uses it for a tooltip and for the
// accessible name, because a screen reader handed a bare 一 or 일 with nothing to go
// on has nothing to work with, and because Japanese and Korean both carry a second
// reading for most digits that a glyph cannot show: 4 is よん rather than し, which
// sounds like death, and 9 is きゅう rather than く. Korean changes with the register,
// since 하나 counts objects and 일 reads a digit.
const digitReadings: Record<string,{ base:string[]; native?:string[] }> = {
  zh: { base:['líng','yī','èr','sān','sì','wǔ','liù','qī','bā','jiǔ'] },
  ja: { base:['rei','ichi','ni','san','yon','go','roku','nana','hachi','kyū'] },
  ko: { base:['yeong','il','i','sam','sa','o','yuk','chil','pal','gu'],
        native:['yeong','hana','dul','set','net','daseot','yeoseot','ilgop','yeodeol','ahop'] },
};
/** Romanised reading of one digit, or '' when the register needs none. */
export function numeralReading(digit:number|string, id:string){
  const [lang, register] = splitNumeralId(id);
  const row = digitReadings[lang];
  // A plain register shows Latin or Arabic digits already, so there is nothing for a
  // reading to disambiguate and a romanisation would only get in the way. A word
  // register needs one more than ever, since the glyph is a word.
  if (!row || registers[lang]?.[register]?.plain) return '';
  const list = register === 'native' ? row.native : row.base;
  return list ? (list[Number(digit)] ?? '') : '';
}

// Every digit that reaches the screen goes through here, so numerals embedded in
// translated copy (counts, level totals, "at least 2 players") localise for free.
/**
 * Looks a key up and renders it.
 *
 * `vars` fills `{name}` placeholders. It is here because a sentence that has to name a
 * file, a count or a number cannot be assembled by concatenating translated fragments -
 * word order and the position of a number differ per language, and the build agent has
 * to say "2 new, 1 changed, 1 removed" in sixteen languages without a translator
 * guessing where the digits go. Missing values render as an empty string rather than
 * leaving `{n}` on screen, so a bad call is invisible rather than alarming.
 *
 * The numeral pass runs last, so a count inserted from a variable is still written in
 * the reader's own numerals.
 */
export function translate(lang:string, key:string, numerals?:string, vars?:Record<string,string|number>) {
  let out = translations[lang]?.[key] || translations.en[key] || key;
  if (vars) for (const [name, value] of Object.entries(vars)) out = out.split('{' + name + '}').join(String(value));
  return toNumerals(out, numerals ?? lang);
}
