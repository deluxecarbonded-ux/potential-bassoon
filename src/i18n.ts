export const languages = [{code:'en',name:'English'},{code:'ar',name:'العربية'},{code:'es',name:'Español'},{code:'fr',name:'Français'},{code:'de',name:'Deutsch'},{code:'pt',name:'Português'},{code:'it',name:'Italiano'},{code:'nl',name:'Nederlands'},{code:'ru',name:'Русский'},{code:'tr',name:'Türkçe'},{code:'hi',name:'हिन्दी'},{code:'ja',name:'日本語'},{code:'ko',name:'한국어'},{code:'zh',name:'中文'},{code:'id',name:'Bahasa Indonesia'},{code:'ur',name:'اردو'}];
// The product name is a proper noun, so it is deliberately NOT translated, exactly
// like "Supabase" in Settings. It lives here as a single source of truth so the
// wordmark and the small brand labels cannot drift apart.
export const brand = 'Exotic';
// Locales written right-to-left. Kept here so the document direction, the equation
// bidi override and the numeral work all agree on one list.
const rtlLocales = ['ar','ur'];
export function isRTL(lang:string){ return rtlLocales.includes(lang); }

const rows = String.raw`
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
eyebrow|FOUR DIGITS. INFINITE POSSIBILITIES.|أربعة أرقام. احتمالات لا نهائية.|CUATRO DÍGITOS. INFINITAS POSIBILIDADES.|QUATRE CHIFFRES. POSSIBILITÉS INFINIES.|VIER ZIFFERN. UNENDLICHE MÖGLICHKEITEN.|QUATRO DÍGITOS. INFINITAS POSSIBILIDADES.|QUATTRO CIFRE. INFINITE POSSIBILITÀ.|VIER CIJFERS. ONEINDIG VEEL MOGELIJKHEDEN.|ЧЕТЫРЕ ЦИФРЫ. БЕСКОНЕЧНЫЕ ВОЗМОЖНОСТИ.|DÖRT RAKAM. SONSUZ OLASILIK.|चार अंक। अनंत संभावनाएँ।|4桁。無限の可能性。|네 자리. 무한한 가능성.|四位数字。无限可能。|EMPAT DIGIT. TAK TERBATAS KEMUNGKINAN.|چار ہندسے۔ لامحدود امکانات۔
hero1|Your mind.|عقلك.|Tu mente.|Votre esprit.|Dein Verstand.|Sua mente.|La tua mente.|Jouw geest.|Ваш разум.|Zihnin.|आपका दिमाग।|あなたの頭脳。|당신의 두뇌.|你的头脑。|Pikiran Anda.|آپ کا ذہن۔
hero2|Your only key.|مفتاحك الوحيد.|Tu única llave.|Votre seule clé.|Dein einziger Schlüssel.|Sua única chave.|La tua unica chiave.|Jouw enige sleutel.|Ваш единственный ключ.|Tek anahtarın.|आपकी एकमात्र चाबी।|唯一の鍵。|당신만의 열쇠.|唯一的钥匙。|Satu-satunya kunci.|آپ کی واحد چابی۔
heroDesc|A little logic. A spark of curiosity. Crack four-digit codes, challenge your mind, and make every discovery count.|قليل من المنطق وشرارة فضول. فك رموزًا من أربعة أرقام وتحدّ عقلك واستمتع بكل اكتشاف.|Un poco de lógica y curiosidad. Descifra códigos de cuatro dígitos y desafía tu mente.|Un peu de logique, une étincelle de curiosité. Déchiffrez des codes à quatre chiffres et défiez votre esprit.|Ein wenig Logik und Neugier. Knacke vierstellige Codes und fordere deinen Verstand.|Um pouco de lógica e curiosidade. Decifre códigos de quatro dígitos e desafie sua mente.|Un po’ di logica e curiosità. Decifra codici a quattro cifre e sfida la tua mente.|Een beetje logica en nieuwsgierigheid. Kraak viercijferige codes en daag jezelf uit.|Немного логики и любопытства. Разгадывайте четырёхзначные коды и тренируйте ум.|Biraz mantık ve merak. Dört haneli kodları çöz, zihnini zorla.|थोड़ा तर्क और जिज्ञासा। चार अंकों के कोड सुलझाएँ और दिमाग को चुनौती दें।|少しの論理と好奇心。4桁のコードを解いて、頭脳に挑戦しましょう。|약간의 논리와 호기심. 네 자리 코드를 풀고 두뇌에 도전하세요.|一点逻辑，一丝好奇。破解四位密码，挑战思维，享受每次发现。|Sedikit logika dan rasa ingin tahu. Pecahkan kode empat digit dan tantang pikiran Anda.|تھوڑی منطق اور تجسس۔ چار ہندسوں کے کوڈ حل کریں اور ذہن کو چیلنج کریں۔
start|Let’s crack a code|لنحل رمزًا|Descifrar un código|Déchiffrer un code|Einen Code knacken|Decifrar um código|Decifra un codice|Kraak een code|Разгадать код|Bir kod çözelim|कोड सुलझाएँ|コードを解く|코드 풀기|开始解码|Pecahkan kode|کوڈ حل کریں
choose|Find your kind of challenge.|اختر تحديك.|Encuentra tu desafío.|Trouvez votre défi.|Finde deine Herausforderung.|Encontre seu desafio.|Trova la tua sfida.|Vind jouw uitdaging.|Найдите свой вызов.|Kendi meydan okumanı bul.|अपनी चुनौती चुनें।|自分に合う挑戦を。|나만의 도전을 찾아보세요.|找到适合你的挑战。|Temukan tantangan Anda.|اپنا چیلنج تلاش کریں۔
chooseSub|Go at your own pace. Or raise the stakes.|العب بوتيرتك أو ارفع التحدي.|A tu ritmo. O sube la apuesta.|À votre rythme. Ou relevez le défi.|Dein Tempo. Oder mehr Nervenkitzel.|No seu ritmo. Ou aumente o desafio.|Al tuo ritmo. O alza la posta.|Op jouw tempo. Of verhoog de inzet.|В своём темпе. Или на скорость.|Kendi hızında. Ya da rekabetle.|अपनी गति से या मुकाबले में।|自分のペースで。それとも競争？|내 속도로, 또는 치열하게.|独自思考，或同场竞技。|Santai atau berkompetisi.|اپنی رفتار سے یا مقابلہ کریں۔
soloDesc|Just you, your intuition, and the next breakthrough. 90 levels to keep you thinking.|أنت وحدسك والاكتشاف التالي. 90 مستوى لتشغيل عقلك.|Tú y tu intuición. 90 niveles para hacerte pensar.|Vous et votre intuition. 90 niveaux pour réfléchir.|Du und deine Intuition. 90 Level zum Nachdenken.|Você e sua intuição. 90 níveis para pensar.|Tu e il tuo intuito. 90 livelli per riflettere.|Jij en je intuïtie. 90 levels om na te denken.|Вы и ваша интуиция. 90 уровней для размышлений.|Sen ve sezgilerin. Düşündüren 90 seviye.|आप और आपका अंतर्ज्ञान। सोचने के लिए 90 स्तर।|自分と直感。思考を刺激する90レベル。|당신과 직관. 생각을 깨우는 90개 레벨.|跟随直觉，探索90个关卡。|Anda dan intuisi. 90 level untuk berpikir.|آپ اور آپ کی بصیرت۔ سوچنے کے لیے 90 درجے۔
multiDesc|Good minds think alike. Great minds race. Bring your friends and crack it first.|العقول الجيدة تتشابه والعظيمة تتسابق. تحدّ أصدقاءك.|Las grandes mentes compiten. Reta a tus amigos.|Les grands esprits font la course. Défiez vos amis.|Große Köpfe messen sich. Fordere Freunde heraus.|Grandes mentes competem. Desafie seus amigos.|Le grandi menti gareggiano. Sfida gli amici.|Grote geesten racen. Daag je vrienden uit.|Великие умы соревнуются. Бросьте вызов друзьям.|Harika zihinler yarışır. Arkadaşlarına meydan oku.|महान दिमाग मुकाबला करते हैं। दोस्तों को चुनौती दें।|優れた頭脳で競争。友達と挑戦しよう。|뛰어난 두뇌들의 경쟁. 친구에게 도전하세요.|聪明的大脑，精彩的较量。邀请好友，率先破解。|Pikiran hebat berlomba. Tantang teman Anda.|عظیم ذہن مقابلہ کرتے ہیں۔ دوستوں کو چیلنج دیں۔
levels|levels|مستوى|niveles|niveaux|Level|níveis|livelli|levels|уровней|seviye|स्तर|レベル|레벨|关卡|level|درجے
difficulties|difficulties|صعوبات|dificultades|difficultés|Schwierigkeiten|dificuldades|difficoltà|moeilijkheden|сложности|zorluk|कठिनाइयाँ|難易度|난이도|难度|kesulitan|مشکلات
atPace|At your pace|بوتيرتك|A tu ritmo|À votre rythme|Dein Tempo|No seu ritmo|Al tuo ritmo|Jouw tempo|В своём темпе|Kendi hızında|अपनी गति से|自分のペース|내 속도로|自由节奏|Sesuai ritme|اپنی رفتار سے
realTime|Real-time battles|مواجهات مباشرة|Batallas en vivo|Duels en direct|Live-Duelle|Batalhas ao vivo|Sfide dal vivo|Live gevechten|Живые поединки|Canlı rekabet|लाइव मुकाबले|リアルタイム対戦|실시간 대결|实时对战|Pertarungan langsung|براہ راست مقابلے
enterSolo|Explore the levels|استكشف المستويات|Explorar niveles|Explorer les niveaux|Level entdecken|Explorar níveis|Esplora i livelli|Ontdek de levels|Открыть уровни|Seviyeleri keşfet|स्तर देखें|レベルを見る|레벨 살펴보기|探索关卡|Jelajahi level|درجے دریافت کریں
enterMulti|Enter the arena|ادخل الساحة|Entrar a la arena|Entrer dans l’arène|Arena betreten|Entrar na arena|Entra nell’arena|Betreed de arena|Войти на арену|Arenaya gir|अखाड़े में जाएँ|アリーナへ|아레나 입장|进入竞技场|Masuk arena|میدان میں جائیں
journey|Small steps. Sharp mind.|خطوات صغيرة. عقل حاد.|Pasos pequeños. Mente aguda.|Petits pas. Esprit vif.|Kleine Schritte. Wacher Geist.|Pequenos passos. Mente afiada.|Piccoli passi. Mente acuta.|Kleine stappen. Scherpe geest.|Маленькие шаги. Острый ум.|Küçük adımlar. Keskin zihin.|छोटे कदम। तेज़ दिमाग।|小さな一歩。鋭い頭脳。|작은 걸음. 날카로운 두뇌.|小小进步，敏锐思维。|Langkah kecil. Pikiran tajam.|چھوٹے قدم۔ تیز ذہن۔
journeySub|Your next discovery is just four digits away.|اكتشافك التالي على بعد أربعة أرقام.|Tu próximo descubrimiento está a cuatro dígitos.|Votre découverte est à quatre chiffres.|Deine Entdeckung ist vier Ziffern entfernt.|Sua descoberta está a quatro dígitos.|La tua scoperta è a quattro cifre.|Je ontdekking is vier cijfers verder.|Открытие в четырёх цифрах от вас.|Keşfin dört rakam uzakta.|आपकी खोज चार अंक दूर है।|次の発見まで、あと4桁。|다음 발견까지 단 네 자리.|四位数字之外，就是新的发现。|Penemuan Anda hanya empat digit lagi.|آپ کی دریافت چار ہندسے دور ہے۔
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
answer|Your four-digit code|رمزك من أربعة أرقام|Tu código de cuatro dígitos|Votre code à quatre chiffres|Dein vierstelliger Code|Seu código de quatro dígitos|Il tuo codice a quattro cifre|Je viercijferige code|Ваш четырёхзначный код|Dört haneli kodun|आपका चार अंकों का कोड|4桁のコード|네 자리 코드|你的四位密码|Kode empat digit Anda|آپ کا چار ہندسوں کا کوڈ
wrong|Not quite. Try a different angle.|ليس تمامًا. جرّب طريقة أخرى.|Casi. Prueba otro enfoque.|Pas tout à fait. Essayez autrement.|Noch nicht. Versuch es anders.|Quase. Tente outro caminho.|Non proprio. Prova diversamente.|Nog niet. Probeer iets anders.|Не совсем. Попробуйте иначе.|Olmadı. Farklı düşün.|अभी नहीं। फिर कोशिश करें।|もう一息。別の角度から。|아직 아니에요. 다른 방법으로.|还差一点，换个角度想想。|Belum tepat. Coba cara lain.|درست نہیں۔ دوبارہ کوشش کریں۔
win|Beautifully cracked.|حل رائع.|Perfectamente descifrado.|Brillamment déchiffré.|Brillant geknackt.|Muito bem decifrado.|Brillantemente decifrato.|Prachtig gekraakt.|Прекрасно разгадано.|Harika çözüldü.|शानदार समाधान।|見事な解読。|멋지게 해독했어요.|漂亮地破解了。|Terpecahkan dengan indah.|بہترین حل۔
reward|Reward earned|المكافأة المكتسبة|Recompensa|Récompense|Belohnung|Recompensa|Ricompensa|Beloning|Награда|Ödül|पुरस्कार|獲得報酬|획득 보상|获得奖励|Hadiah diperoleh|انعام حاصل
replay|Play again|العب مجددًا|Jugar de nuevo|Rejouer|Nochmal spielen|Jogar novamente|Rigioca|Opnieuw spelen|Играть снова|Tekrar oyna|फिर खेलें|もう一度|다시 플레이|再玩一次|Main lagi|دوبارہ کھیلیں
next|Next level|المستوى التالي|Siguiente nivel|Niveau suivant|Nächstes Level|Próximo nível|Livello seguente|Volgend level|Следующий уровень|Sonraki seviye|अगला स्तर|次のレベル|다음 레벨|下一关|Level berikutnya|اگلا درجہ
attempts|Attempts|المحاولات|Intentos|Tentatives|Versuche|Tentativas|Tentativi|Pogingen|Попытки|Denemeler|प्रयास|挑戦回数|시도|尝试次数|Percobaan|کوششیں
hint|A little nudge|تلميح صغير|Una pequeña pista|Un petit indice|Ein kleiner Tipp|Uma pequena dica|Un piccolo aiuto|Een kleine hint|Небольшая подсказка|Küçük bir ipucu|एक छोटा संकेत|小さなヒント|작은 힌트|一点提示|Petunjuk kecil|چھوٹا اشارہ
reveal|Reveal a digit|اكشف رقمًا|Revelar un dígito|Révéler un chiffre|Ziffer aufdecken|Revelar um dígito|Rivela una cifra|Onthul een cijfer|Открыть цифру|Rakam göster|एक अंक दिखाएँ|1桁を表示|한 자리 공개|揭示一位|Ungkap satu digit|ایک ہندسہ دکھائیں
ai|Ask AI for a hint|اطلب تلميحًا ذكيًا|Pedir pista a IA|Demander un indice IA|KI-Tipp anfordern|Pedir dica à IA|Chiedi un indizio IA|Vraag AI om een hint|Подсказка ИИ|Yapay zekâ ipucu|AI संकेत पूछें|AIにヒントを聞く|AI 힌트 요청|请求AI提示|Minta petunjuk AI|AI سے اشارہ لیں
noItems|Visit the solo shop to stock up.|للحصول على المزيد زر متجر الفردي.|Visita la tienda solo.|Visitez la boutique solo.|Besuche den Solo-Shop.|Visite a loja solo.|Visita il negozio solo.|Bezoek de solo-winkel.|Посетите соло-магазин.|Solo mağazaya uğra.|एकल दुकान पर जाएँ।|ソロショップへ。|솔로 상점을 방문하세요.|请前往单人商店。|Kunjungi toko solo.|واحد دکان پر جائیں۔
shopTitle|A little edge. Earned, not bought.|أفضلية صغيرة. تُكتسب باللعب.|Una ventaja que te ganas.|Un avantage qui se mérite.|Ein Vorteil. Ehrlich erspielt.|Uma vantagem conquistada.|Un vantaggio guadagnato.|Een voorsprong. Zelf verdiend.|Преимущество, заработанное игрой.|Kazanılmış bir avantaj.|जीतकर पाएँ बढ़त।|プレイで得る、少しの強み。|플레이로 얻는 작은 우위.|靠实力赢得的小小优势。|Keunggulan yang diraih.|کما کر حاصل کردہ برتری۔
shopDesc|Win games, earn coins, make them count. Each mode has its own wallet and collection.|اربح واكسب العملات. لكل وضع محفظته ومجموعته.|Gana monedas jugando. Cada modo tiene su cartera.|Gagnez des pièces. Chaque mode a sa collection.|Gewinne Münzen. Jeder Modus hat ein eigenes Guthaben.|Ganhe moedas. Cada modo tem sua carteira.|Vinci monete. Ogni modalità ha il suo portafoglio.|Verdien munten. Elke modus heeft een eigen saldo.|Побеждайте и копите монеты. У режимов разные кошельки.|Kazan, jeton biriktir. Her modun cüzdanı ayrıdır.|जीतकर सिक्के पाएँ। हर मोड का अलग बटुआ है।|勝利でコイン獲得。モードごとに別の財布。|승리하고 코인을 모으세요. 모드별 지갑이 달라요.|赢取金币。各模式拥有独立钱包和藏品。|Menang dan raih koin. Tiap mode punya dompet sendiri.|جیت کر سکے کمائیں۔ ہر موڈ کا الگ بٹوہ ہے۔
hintPack|The nudge|التلميح|La pista|Le coup de pouce|Der Denkanstoß|A dica|La dritta|Het zetje|Подсказка|İpucu|संकेत|ひらめき|힌트|灵感提示|Petunjuk|اشارہ
hintDesc|One thoughtful hint when you need a fresh perspective.|تلميح عند الحاجة إلى منظور جديد.|Una pista para una nueva perspectiva.|Un indice pour voir autrement.|Ein Tipp für eine neue Perspektive.|Uma dica para uma nova perspectiva.|Un indizio per una nuova prospettiva.|Een hint voor een nieuwe blik.|Подсказка для нового взгляда.|Yeni bir bakış açısı için ipucu.|नए नज़रिए के लिए एक संकेत।|新しい視点のためのヒント1回分。|새로운 관점을 위한 힌트 한 개.|换个角度思考的一次提示。|Satu petunjuk untuk sudut pandang baru.|نئے زاویے کے لیے ایک اشارہ۔
digitPack|The missing piece|القطعة الناقصة|La pieza que falta|La pièce manquante|Das fehlende Teil|A peça que falta|Il pezzo mancante|Het ontbrekende stukje|Недостающая деталь|Eksik parça|लापता टुकड़ा|最後のピース|빠진 조각|缺失拼图|Bagian yang hilang|گمشدہ ٹکڑا
digitDesc|Reveal the first digit of a code. Find your way from there.|اكشف الرقم الأول ثم أكمل بنفسك.|Revela el primer dígito y sigue.|Révélez le premier chiffre puis continuez.|Decke die erste Ziffer auf.|Revele o primeiro dígito e continue.|Rivela la prima cifra e continua.|Onthul het eerste cijfer en ga verder.|Откройте первую цифру и продолжайте.|İlk rakamı gör, devamını bul.|पहला अंक देखें, आगे स्वयं खोजें।|最初の1桁を表示。あとは自力で。|첫 자리를 공개하고 나머지를 푸세요.|揭示第一位，继续自己探索。|Ungkap digit pertama, temukan sisanya.|پہلا ہندسہ دیکھیں، باقی خود ڈھونڈیں۔
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
how1|One question. One four-digit answer.|سؤال واحد. إجابة من أربعة أرقام.|Una pregunta. Cuatro dígitos.|Une question. Quatre chiffres.|Eine Frage. Vier Ziffern.|Uma pergunta. Quatro dígitos.|Una domanda. Quattro cifre.|Eén vraag. Vier cijfers.|Один вопрос. Четыре цифры.|Bir soru. Dört rakam.|एक प्रश्न। चार अंक।|1つの問題。4桁の答え。|한 문제. 네 자리 정답.|一道题，四位答案。|Satu soal. Empat digit.|ایک سوال۔ چار ہندسے۔
how2|Read closely, follow the clues, and enter your code. Leading zeroes count. Wrong guesses never cost coins.|اقرأ واتبع التلميحات وأدخل الرمز. الأصفار البادئة مهمة. لا تكلفة للتخمين الخاطئ.|Lee las pistas e introduce el código. Los ceros iniciales cuentan. Fallar no cuesta monedas.|Suivez les indices. Les zéros initiaux comptent. Les erreurs ne coûtent rien.|Folge den Hinweisen. Führende Nullen zählen. Fehler kosten keine Münzen.|Siga as pistas. Zeros iniciais contam. Erros não custam moedas.|Segui gli indizi. Gli zeri iniziali contano. Sbagliare non costa monete.|Volg de hints. Nullen vooraan tellen mee. Fouten kosten geen munten.|Читайте подсказки. Нули в начале важны. Ошибки не стоят монет.|İpuçlarını izle. Baştaki sıfırlar önemli. Yanlışlar jeton götürmez.|संकेत पढ़ें। शुरू के शून्य भी गिनें। गलत उत्तर पर सिक्के नहीं कटते।|ヒントに従って入力。先頭の0も含めます。間違えてもコインは減りません。|단서를 따라 입력하세요. 앞자리 0도 포함돼요. 오답으로 코인을 잃지 않아요.|仔细阅读线索，输入密码。保留前导零，猜错不会扣金币。|Ikuti petunjuk. Nol di depan dihitung. Jawaban salah tidak mengurangi koin.|اشارے پڑھیں۔ شروع کے صفر بھی شامل ہیں۔ غلط جواب پر سکے نہیں کٹتے۔
how3|Clear levels in order. Earn coins on your first win. Each difficulty is its own 30-level journey.|أكمل بالترتيب. اربح عملات عند أول فوز. لكل صعوبة 30 مستوى.|Avanza en orden. Gana monedas en la primera victoria. 30 niveles por dificultad.|Avancez dans l’ordre. Récompense au premier succès. 30 niveaux par difficulté.|Spiele der Reihe nach. Münzen beim ersten Sieg. 30 Level pro Schwierigkeit.|Avance em ordem. Moedas na primeira vitória. 30 níveis por dificuldade.|Avanza in ordine. Monete alla prima vittoria. 30 livelli per difficoltà.|Speel op volgorde. Munten bij eerste winst. 30 levels per moeilijkheid.|Проходите по порядку. Монеты за первую победу. По 30 уровней.|Sırayla ilerle. İlk galibiyette jeton kazan. Her zorlukta 30 seviye.|क्रम से खेलें। पहली जीत पर सिक्के। हर कठिनाई में 30 स्तर।|順番にクリア。初勝利でコイン獲得。難易度ごとに30レベル。|순서대로 클리어하세요. 첫 승리에 코인을 받아요. 난이도별 30레벨.|按顺序闯关，首次获胜获得金币。每种难度30关。|Selesaikan berurutan. Koin saat pertama menang. 30 level tiap kesulitan.|ترتیب سے کھیلیں۔ پہلی جیت پر سکے۔ ہر مشکل میں 30 درجے۔
how4|In the arena, the same language gets the same puzzle. Different languages get their own code. First to crack scores immediately; Time attack gives everyone 45 seconds per round.|في الساحة تتطابق الأسئلة لنفس اللغة. اللغات المختلفة لها رموز مختلفة. الأسرع يسجل فورًا؛ سباق الزمن يمنح 45 ثانية للجولة.|Mismo idioma, mismo acertijo. Idiomas distintos, códigos distintos. El primero puntúa; contrarreloj da 45 segundos por ronda.|Même langue, même énigme. Langues différentes, codes différents. Le premier marque ; 45 secondes par manche chronométrée.|Gleiche Sprache, gleiches Rätsel. Andere Sprache, anderer Code. Der Erste punktet; Zeitrennen hat 45 Sekunden pro Runde.|Mesmo idioma, mesmo enigma. Idiomas diferentes, códigos diferentes. O primeiro pontua; 45 segundos por rodada cronometrada.|Stessa lingua, stesso enigma. Lingue diverse, codici diversi. Il primo segna; 45 secondi per round a tempo.|Zelfde taal, zelfde puzzel. Andere talen, andere codes. De eerste scoort; tijdrace geeft 45 seconden per ronde.|Один язык — одна загадка. Разные языки — разные коды. Первый получает балл; на время даётся 45 секунд за раунд.|Aynı dil, aynı bulmaca. Farklı diller, farklı kodlar. İlk çözen puan alır; zaman modu tur başına 45 saniye verir.|एक भाषा, एक पहेली। अलग भाषा, अलग कोड। पहले सुलझाने पर अंक; समय चुनौती में प्रति राउंड 45 सेकंड।|同じ言語なら同じ問題、違う言語なら別のコード。早解きは最初の正解で得点。タイムアタックは1ラウンド45秒。|같은 언어는 같은 문제, 다른 언어는 다른 코드. 먼저 풀면 즉시 득점, 타임 어택은 라운드당 45초.|相同语言对应相同谜题，不同语言拥有不同密码。率先破解立即得分；限时模式每回合45秒。|Bahasa sama, soal sama. Bahasa berbeda, kode berbeda. Pemecah pertama mendapat poin; mode waktu 45 detik per ronde.|ایک زبان، ایک پہیلی۔ مختلف زبانیں، مختلف کوڈ۔ پہلے حل پر پوائنٹ؛ وقت موڈ میں 45 سیکنڈ فی راؤنڈ۔
local|Saved on this device|محفوظ على هذا الجهاز|Guardado en este dispositivo|Enregistré sur cet appareil|Auf diesem Gerät gespeichert|Salvo neste dispositivo|Salvato sul dispositivo|Op dit apparaat opgeslagen|Сохранено на устройстве|Bu cihazda kayıtlı|इस डिवाइस पर सहेजा|この端末に保存|이 기기에 저장됨|保存在此设备|Tersimpan di perangkat|اس آلے پر محفوظ
connected|Connected|متصل|Conectado|Connecté|Verbunden|Conectado|Connesso|Verbonden|Подключено|Bağlı|कनेक्टेड|接続済み|연결됨|已连接|Terhubung|منسلک
error|Something didn’t connect. Please try again.|تعذر الاتصال. حاول مجددًا.|No se pudo conectar. Inténtalo de nuevo.|Connexion impossible. Réessayez.|Keine Verbindung. Versuch es erneut.|Falha na conexão. Tente novamente.|Connessione fallita. Riprova.|Verbinding mislukt. Probeer opnieuw.|Нет соединения. Попробуйте снова.|Bağlanamadı. Tekrar dene.|कनेक्शन नहीं हुआ। फिर कोशिश करें।|接続できませんでした。再試行してください。|연결하지 못했어요. 다시 시도하세요.|连接失败，请重试。|Gagal terhubung. Coba lagi.|رابطہ نہیں ہوا۔ دوبارہ کوشش کریں۔
needPlayers|At least 2 players to start.|يلزم لاعبان على الأقل.|Se necesitan 2 jugadores.|Il faut au moins 2 joueurs.|Mindestens 2 Spieler nötig.|São necessários 2 jogadores.|Servono almeno 2 giocatori.|Minimaal 2 spelers nodig.|Нужно минимум 2 игрока.|En az 2 oyuncu gerekli.|कम से कम 2 खिलाड़ी चाहिए।|2人以上で開始できます。|최소 2명이 필요해요.|至少需要2名玩家。|Minimal 2 pemain.|کم از کم 2 کھلاڑی درکار۔
host|Host|المضيف|Anfitrión|Hôte|Host|Anfitrião|Ospite|Host|Ведущий|Kurucu|मेज़बान|ホスト|호스트|房主|Tuan rumah|میزبان
roundDone|Code cracked. Waiting for the next round.|تم الحل. بانتظار الجولة التالية.|Resuelto. Esperando la siguiente ronda.|Résolu. En attente de la prochaine manche.|Geknackt. Warte auf die nächste Runde.|Resolvido. Aguardando a próxima rodada.|Risolto. In attesa del prossimo round.|Gekraakt. Wachten op volgende ronde.|Разгадано. Ждите следующий раунд.|Çözüldü. Sonraki tur bekleniyor.|सुलझा लिया। अगले राउंड की प्रतीक्षा।|解読成功。次のラウンドを待機中。|해독 완료. 다음 라운드 대기 중.|已破解，等待下一回合。|Terpecahkan. Menunggu ronde berikutnya.|حل ہوگیا۔ اگلے راؤنڈ کا انتظار۔
allDone|Every code cracked. A brilliant journey.|كل الرموز محلولة. رحلة رائعة.|Todo descifrado. Un gran viaje.|Tout est déchiffré. Quel parcours.|Alles geknackt. Eine tolle Reise.|Tudo decifrado. Uma bela jornada.|Tutto decifrato. Un viaggio brillante.|Alles gekraakt. Een prachtige reis.|Все коды разгаданы. Отличный путь.|Tüm kodlar çözüldü. Harika yolculuk.|सभी कोड सुलझाए। शानदार सफर।|全コード解読。素晴らしい旅でした。|모든 코드 해독. 멋진 여정이었어요.|所有密码均已破解，精彩的旅程。|Semua kode terpecahkan. Perjalanan hebat.|تمام کوڈ حل۔ بہترین سفر۔
menu|Open menu|افتح القائمة|Abrir menú|Ouvrir le menu|Menü öffnen|Abrir menu|Apri menu|Menu openen|Открыть меню|Menüyü aç|मेनू खोलें|メニューを開く|메뉴 열기|打开菜单|Buka menu|مینو کھولیں
moved|That round has moved on.|انتقلت هذه الجولة.|Esa ronda ya avanzó.|Cette manche est passée.|Diese Runde ist vorbei.|Essa rodada já avançou.|Quel round è passato.|Deze ronde is voorbij.|Раунд уже сменился.|Bu tur geçti.|यह राउंड आगे बढ़ गया।|このラウンドは終了しました。|이 라운드는 이미 넘어갔어요.|这一回合已经结束。|Ronde ini sudah berlanjut.|یہ راؤنڈ آگے بڑھ چکا۔
aiUnavailable|AI hints are resting. Use a shop hint, or try again later.|تلميحات الذكاء ترتاح الآن. استخدم تلميح المتجر أو حاول لاحقًا.|Las pistas de IA descansan. Usa una de la tienda o inténtalo luego.|Les indices IA se reposent. Utilisez un indice boutique ou réessayez.|KI-Tipps pausieren. Nutze einen Shop-Tipp oder versuch es später.|As dicas de IA estão em pausa. Use uma dica da loja ou tente depois.|Gli indizi IA riposano. Usa un indizio del negozio o riprova.|AI-hints rusten even. Gebruik een winkelhint of probeer later.|Подсказки ИИ отдыхают. Используйте подсказку из магазина или позже.|Yapay zekâ ipuçları dinleniyor. Mağaza ipucunu kullan veya sonra dene.|AI संकेत अभी उपलब्ध नहीं। दुकान का संकेत लें या बाद में कोशिश करें।|AIヒントは休憩中です。ショップのヒントを使うか、後でもう一度。|AI 힌트가 잠시 쉬고 있어요. 상점 힌트를 쓰거나 나중에 다시 시도하세요.|AI提示暂时休息。请使用商店提示，或稍后再试。|Petunjuk AI sedang istirahat. Gunakan petunjuk toko atau coba lagi nanti.|AI اشارے آرام کر رہے ہیں۔ دکان کا اشارہ استعمال کریں یا بعد میں کوشش کریں۔
digit0|0|٠|0|0|0|0|0|0|0|0|०|０|０|０|0|۰
digit1|1|١|1|1|1|1|1|1|1|1|१|１|１|１|1|۱
digit2|2|٢|2|2|2|2|2|2|2|2|२|２|２|２|2|۲
digit3|3|٣|3|3|3|3|3|3|3|3|३|３|３|３|3|۳
digit4|4|٤|4|4|4|4|4|4|4|4|४|４|４|４|4|۴
digit5|5|٥|5|5|5|5|5|5|5|5|५|５|５|５|5|۵
digit6|6|٦|6|6|6|6|6|6|6|6|६|６|６|６|6|۶
digit7|7|٧|7|7|7|7|7|7|7|7|७|７|７|７|7|۷
digit8|8|٨|8|8|8|8|8|8|8|8|८|８|８|８|8|۸
digit9|9|٩|9|9|9|9|9|9|9|9|९|９|９|９|9|۹
`;
export const translations: Record<string,Record<string,string>> = Object.fromEntries(languages.map(l=>[l.code,{}]));
for (const line of rows.trim().split('\n')) { const [key,...values] = line.split('|'); languages.forEach((l,i)=>{translations[l.code][key]=values[i]?.replaceAll('\\n','\n') || values[0];}); }

// Digit glyphs are data rather than words, but they are per-locale, so they are
// translated in the table above like every other string.
//
// Group separators and grouping sizes are kept in code, not the table, because two
// of them are invisible characters that would be unmaintainable in a pipe-delimited
// row. Values follow CLDR. CJK locales use fullwidth digits, the conventional form
// for a digit-centric puzzle, which also keeps a four-digit code visually aligned.
const ASCII_DIGITS = '0123456789';
const groupSeparators: Record<string,string> = {
  en: ',', ar: '٬', es: '.', fr: ' ', de: '.', pt: '.', it: '.', nl: '.',
  ru: ' ', tr: '.', hi: ',', ja: ',', ko: ',', zh: ',', id: '.', ur: '٬',
};
// [least-significant group size, size of the remaining groups]. Devanagari counts in
// lakh/crore (12,34,567), everything else groups by threes.
const groupSizes: Record<string,[number,number]> = { hi: [3, 2] };

const digitSets: Record<string,string> = {};
const groupByLocale: Record<string,string> = {};
for (const l of languages) {
  const row = translations[l.code];
  digitSets[l.code] = Array.from({length:10},(_,i)=>row['digit'+i] || ASCII_DIGITS[i]).join('');
  groupByLocale[l.code] = groupSeparators[l.code] ?? ',';
}
// Accept any supported script on input, not just the active one: a user can paste or
// type digits from any keyboard, and the code field must still yield ASCII.
const incomingDigits: Record<string,string> = {};
for (const set of Object.values(digitSets)) for (let i=0;i<10;i++) incomingDigits[set[i]] = ASCII_DIGITS[i];
for (let i=0;i<10;i++) incomingDigits[ASCII_DIGITS[i]] = ASCII_DIGITS[i];

/** Rewrites ASCII digits in `text` to the locale's script. Display only. */
export function toNumerals(text:string, lang:string){
  const set = digitSets[lang];
  if (!set || set === ASCII_DIGITS) return text;
  let out = '';
  for (const ch of text) out += ch >= '0' && ch <= '9' ? set[ch.charCodeAt(0)-48] : ch;
  return out;
}
/** Rewrites any supported numeral script back to ASCII, for parsing and validation. */
export function fromNumerals(text:string){
  let out = '';
  for (const ch of text) out += incomingDigits[ch] ?? ch;
  return out;
}
/** Grouped number in the locale's digits, e.g. 1234567 -> "1,234,567" / "12,34,567". */
export function num(value:number|string, lang:string){
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return toNumerals(String(value), lang);
  const digits = String(Math.abs(n));
  const [primary, secondary] = groupSizes[lang] ?? [3, 3];
  const sep = groupByLocale[lang] ?? ',';
  let body: string;
  if (secondary === primary || digits.length <= primary) {
    body = digits.replace(new RegExp(`\\B(?=(\\d{${primary}})+(?!\\d))`,'g'), sep);
  } else {
    const cut = digits.length - primary;
    const head = digits.slice(0, cut).replace(new RegExp(`\\B(?=(\\d{${secondary}})+(?!\\d))`,'g'), sep);
    body = head + sep + digits.slice(cut);
  }
  return (n < 0 ? '-' : '') + toNumerals(body, lang);
}
/** Zero-padded number in the locale's digits, for level codes and timers. */
export function pad(value:number|string, width:number, lang:string){
  return toNumerals(String(value).padStart(width,'0'), lang);
}

// Every digit that reaches the screen goes through here, so numerals embedded in
// translated copy (counts, level totals, "at least 2 players") localise for free.
export function translate(lang:string,key:string) { return toNumerals(translations[lang]?.[key] || translations.en[key] || key, lang); }
