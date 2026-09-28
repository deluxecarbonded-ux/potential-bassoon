import {forwardAll, softmax, type Network} from './engine.ts';
import {CHAT_WEIGHTS} from './chat-weights.ts';

/**
 * The chat's intent classifier, running entirely on the reader's machine.
 *
 * Chat is not a language model, and this file is where that decision is made rather than
 * papered over. Everything else in src/ai is a ranker or a classifier over a library of
 * answers the reasoning layer already knows how to produce, and chat is the same idea with
 * a different library: eight intents, a reply for each, and a trained network deciding
 * which one a message is. It cannot invent a sentence, and so it cannot hallucinate one.
 *
 * What is learned here is which of eight things somebody said. What is written by hand is
 * what to say back, in src/ai/chat.ts, and - just below - the words of all sixteen
 * languages. The split matters, and the second half of it is the part that took two tries:
 * a reply has to be exactly right in sixteen languages, and a learned reply is a
 * plausible sentence in one of them.
 *
 * No request leaves the device, there is no key, and there is nothing to run out of.
 */

/**
 * The eight intents, in the order the network's outputs are laid out.
 *
 * 'unknown' is last on purpose. It is the class that has to win when nothing else does, so
 * a message the chat has no answer for produces "I do not know" rather than a confident
 * reply to the wrong question. The last index is also where the network's own confidence
 * is read from, which is why a lone 0.5 on a real intent means something different from a
 * 0.5 with the rejection class taking the other half.
 */
export const INTENTS = [
  'greeting',
  'capabilities',
  'privacy',
  'code',
  'edit',
  'thanks',
  'smalltalk',
  'unknown',
] as const;

export type Intent = (typeof INTENTS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// The word table
// ─────────────────────────────────────────────────────────────────────────────
//
// Every one of the sixteen languages the interface is written in, because a chat that
// answers in your language and then fails to understand a question written in it is worse
// than useless - it looks like it understood and gave you the wrong sentence.
//
// The words are hand-written and grouped by the part they play, never by which intent
// they were found in, and that is a deliberate change from the first version of this file.
// That version handed the network one feature per word, which sounds more like a model
// and is not: with sixteen languages the network then had to learn sixteen vocabularies
// from three sentences each, and its hidden layer plateaued at 87% train accuracy no
// matter how long it ran. The words in a language are not the thing worth learning - the
// *roles* they play are, and a role is the same in every language. So the table below
// says that "كم файла" contains a thing-word and an ask-word, and the network is left to
// work out what a thing-word with an ask-word and no verb of making a change means.
//
// So the network's job is the interactions, which is the part a lookup table cannot do:
// "what can you do" and "what does Agent.tsx do" are the same two roles with a code word
// between them, "how are you" and "how do you work" differ by a single capability word,
// and a request to edit is an act-word with no question mark anywhere in it. Those are
// eight ways of being wrong that have to be got right, and they are what the hidden
// layer is for.
//
// A word can carry more than one part, so a word is written into as many groups as it has
// parts: 'use' asks about what this is and also asks for help, and 'can' opens a
// capability question and also opens a privacy one. What a word may not do is appear in
// two groups that disagree - 'how' is a question in every language here, and if it were
// ever filed as a thanks-word the file would be a lie. That is checked at the bottom of
// this section rather than trusted.
export const ROLES = [
  'greet',    // a salutation
  'ask',      // opens a request for information: what, who, can, is
  'how',      // "how" specifically, which is not the same as "what"
  'self',     // the assistant as the subject of the sentence
  'can',      // what this thing can do, or what it is for
  'privacy',  // data, keys, the network, safety
  'code',     // the project, its files, the model
  'act',      // a verb of making a change
  'thing',    // the object of that change
  'thanks',   // gratitude
  'chat',     // the weather, a joke, a name, the day
  'filler',   // words that carry no signal of their own
] as const;

export type Role = (typeof ROLES)[number];

const EN: Record<Role, string[]> = {
  greet: ['hi', 'hello', 'hey', 'morning', 'afternoon', 'evening', 'greetings', 'yo', 'howdy'],
  ask: ['what', 'who', 'is', 'are', 'can', 'do', 'does', 'why', 'purpose', 'about', 'whats', 'wheres', 'whats-up', 'worth', 'where', 'tell', 'find'],
  how: ['how'],
  self: ['you', 'your', 'yourself', 'me', 'my', 'i'],
  can: ['able', 'help', 'use', 'work', 'works', 'explain', 'capabilities', 'capable', 'feature', 'features', 'useful', 'used', 'anything', 'else', 'job', 'jobs', 'could'],
  privacy: ['data', 'send', 'sent', 'sends', 'private', 'privacy', 'offline', 'online', 'internet',
    'download', 'downloads', 'server', 'key', 'api', 'phone', 'home', 'track', 'tracking', 'real',
    'human', 'safe', 'secret', 'saved', 'cost', 'upload', 'uploads', 'uploaded', 'plane', 'stored', 'password', 'secure', 'kept', 'servers', 'info'],
  code: ['code', 'codebase', 'project', 'file', 'files', 'source', 'function', 'component', 'module',
    'typescript', 'css', 'i18n', 'locale', 'locales', 'translations', 'supabase', 'schema', 'database',
    'hint', 'hints', 'planner', 'ai', 'model', 'network', 'weight', 'weights', 'trained', 'recipe',
    'recipes', 'engine', 'big', 'difference', 'contained', 'contain', 'hold', 'read', 'know', 'size', 'parameters'],
  act: ['add', 'create', 'make', 'change', 'rename', 'update', 'edit', 'remove', 'delete', 'rewrite',
    'introduce', 'new', 'instead', 'give'],
  thing: ['string', 'theme', 'setting', 'settings', 'label', 'text', 'counter', 'toggle', 'option',
    'title', 'copy', 'wording', 'translation', 'page', 'counter', 'things', 'something', 'section'],
  thanks: ['thanks', 'thank', 'cheers', 'appreciate', 'grateful', 'nice', 'perfect', 'helpful', 'bunch', 'lot', 'helped'],
  chat: ['weather', 'joke', 'day', 'today', 'name', 'age', 'love', 'like', 'hobby', 'hobbies', 'food',
    'music', 'film', 'movie', 'game', 'play', 'busy', 'tired', 'favourite', 'fun', 'old', 'interesting', 'happy', 'doing',
    'bored', 'boring', 'week', 'weekend', 'sleep', 'mood', 'chats', 'chat', 'feeling'],
  filler: ['the', 'a', 'an', 'and', 'to', 'for', 'in', 'of', 'at', 'it', 'this', 'that', 'there', 'should', 'good', 'great',
    'please', 'ok', 'so', 'right', 'now', 'quickly', 'honestly', 'hmm', 'also', 'just', 'really', 'well'],
};

const AR: Record<Role, string[]> = {
  greet: ['مرحبا', 'السلام', 'اهلا', 'أهلا', 'صباح', 'مساء', 'ليلا', 'يتم', 'يا', 'تحياتي', 'وسهلا'],
  ask: ['ماذا', 'لماذا', 'هل', 'ما', 'من', 'أين', 'كم', 'عن', 'بكم', 'الذي', 'أريد', 'الأسئلة', 'بدك'],
  how: ['كيف', 'طريقة', 'أود', 'بدي'],
  self: ['انت', 'لك', 'عندك', 'إخباري', 'لديك', 'منك'],
  can: ['تقدر', 'تستطيع', 'يعمل', 'تفيد', 'تساعد', 'تعمل', 'تفعل', 'يمكنك', 'توضيح', 'معرفة', 'تستطيعين', 'قدراتك', 'مساعدة', 'استخدام'],
  privacy: ['بيانات', 'ترسل', 'خاص', 'انترنت', 'مفتاح', 'بدون', 'تحميل', 'سحابي', 'امن', 'آمن', 'الخارجي', 'بياناتي', 'آمنة', 'البيانات', 'الخادم', 'الخاص', 'الرسائل', 'السر', 'المعلومات', 'السحابة', 'رسائلي'],
  code: ['كود', 'ملف', 'ملفا', 'مشروع', 'نموذج', 'مخطط', 'وصفات', 'مترجم', 'يعرف', 'المشروع', 'الكود', 'لملف', 'الوظائف', 'النماذج', 'الوظيفة', 'الجزء', 'البرنامج'],
  act: ['اضف', 'غير', 'احذف', 'انشئ', 'بدل', 'تغيير', 'صنع', 'رفع', 'تتعاملين', 'العثور', 'عمل', 'حفظ', 'لبناء'],
  thing: ['عداد', 'نص', 'عدادا', 'إعدادا', 'العنوان', 'ترجمة', 'سمة', 'لغة', 'الرئيسي', 'الأساسية', 'المعلمات', 'الشخصية', 'جهازي'],
  thanks: ['شكرا', 'جزيلا', 'ممتن', 'جزيل', 'ممون'],
  chat: ['اسمك', 'طقس', 'نكته', 'نكتة', 'حالك', 'اسم', 'ضحك', 'عمرك', 'عمر', 'يومك', 'يوم', 'مزاج', 'شو', 'اليوم', 'حول'],
  filler: ['أنا', 'و', 'في', 'هو', 'هذا', 'كل', 'يوجد', 'جديد', 'جديدة', 'من فضلك', 'حسنا', 'الآن', 'أيضا', 'كان', 'أن', 'ان'],
};

const ES: Record<Role, string[]> = {
  greet: ['hola', 'buenos', 'buenas'],
  ask: ['que', 'quien', 'puedes', 'puede', 'eres', 'esta', 'sirve', 'donde', 'cuantos', 'cuantas', 'cual', 'algun', 'necesito', 'cuando', 'encuentras'],
  how: ['como'],
  self: ['tu', 'tuya', 'tuyas', 'tienes', 'puedo', 'asistente', 'usuario', 'tengo'],
  can: ['ayudas', 'explicas', 'sabes', 'capacidades', 'sirven', 'sirves', 'para', 'podrias', 'ayuda', 'entender', 'ayudado', 'explicar', 'util', 'podemos', 'ayudarme'],
  privacy: ['datos', 'envias', 'privado', 'internet', 'clave', 'seguro', 'nube', 'subes', 'subir', 'seguridad', 'mensajes', 'seguros', 'privacidad', 'segura'],
  code: ['codigo', 'archivo', 'archivos', 'proyecto', 'modelo', 'red', 'recipe', 'recetas', 'base', 'planificador', 'funcion', 'fuente', 'models'],
  act: ['anade', 'agrega', 'cambia', 'borra', 'crea', 'reescribe', 'haz', 'hacer', 'hace', 'renombra', 'elimina', 'escribe', 'cambiar', 'haciendo', 'afecta'],
  thing: ['contador', 'texto', 'ajuste', 'ajustes', 'etiqueta', 'tema', 'opcion', 'pagina', 'cadena', 'nueva', 'interacciones', 'sistema', 'configuracion', 'inicio', 'seccion', 'contacto', 'campo'],
  thanks: ['gracias', 'agradezco', 'gentil', 'amable'],
  chat: ['nombre', 'broma', 'tiempo', 'chiste', 'estoy', 'musica', 'comida', 'años', 'dia'],
  filler: ['y', 'el', 'la', 'un', 'una', 'de', 'en', 'mi', 'todo', 'este', 'por favor', 'vale', 'ahora', 'tambien'],
};

const FR: Record<Role, string[]> = {
  greet: ['bonjour', 'salut', 'bonsoir', 'coucou'],
  ask: ['quoi', 'qui', 'est', 'ou', 'peux', 'pourquoi', 'sert', 'quelle', 'quelles', 'quels', 'savez', 'avez', 'combien'],
  how: ['comment'],
  self: ['tu', 'ta', 'tes', 'ton', 'vous', 'assistant', 'elle'],
  can: ['aides', 'explique', 'fonctionne', 'sais', 'faire', 'capacites', 'travail', 'utilisable', 'dire', 'pouvez', 'savoir', 'comprendre', 'fonctionnalite', 'aide'],
  privacy: ['donnees', 'envoies', 'prive', 'internet', 'cle', 'serveur', 'sur', 'rien', 'televerse', 'televerses', 'envoi', 'envoies', 'informations', 'risque', 'securite', 'protegees', 'personnelles'],
  code: ['code', 'fichier', 'fichiers', 'projet', 'modele', 'reseau', 'recettes', 'base', 'planificateur', 'composant', 'structure', 'documentation', 'fonction'],
  act: ['ajoute', 'change', 'supprime', 'cree', 'reecris', 'fais', 'modifie', 'modifier', 'changer', 'donner', 'verifier', 'ajuster'],
  thing: ['compteur', 'texte', 'reglage', 'reglages', 'libelle', 'theme', 'option', 'chaine', 'page', 'parametre', 'parametres', 'partie', 'bouton', 'champ'],
  thanks: ['merci', 'remercie', 'gentil', 'aimable'],
  chat: ['nom', 'blague', 'meteo', 'vas', 'plaisir', 'musique', 'nourriture', 'ans', 'age', 'jour', 'journee'],
  filler: ['et', 'le', 'la', 'un', 'une', 'de', 'dans', 'mon', 'ce', 'cet', 'tout', 'sil te plait', 'bon', 'maintenant', 'aussi'],
};

const DE: Record<Role, string[]> = {
  greet: ['hallo', 'guten', 'moin', 'abend'],
  ask: ['was', 'wer', 'bist', 'kannst', 'koennst', 'gibts', 'sollte', 'fragen', 'fragt', 'sagen', 'welchen', 'worin', 'woher'],
  how: ['wie'],
  self: ['du', 'dein', 'deine', 'ich', 'mir', 'meine', 'dich', 'hast', 'mein', 'assistent'],
  can: ['helfen', 'erklaerst', 'funktioniert', 'funktionierst', 'faehig', 'zweck', 'kann', 'lauft', 'konntest', 'moglichkeiten', 'beantworten', 'erklaren', 'konnte', 'konnen'],
  privacy: ['daten', 'sendest', 'privat', 'internet', 'schluessel', 'server', 'sicher', 'nichts', 'hochlaedst', 'nachrichten', 'gespeichert', 'passwort', 'netzwerk', 'darf', 'passworte', 'lokal'],
  code: ['code', 'datei', 'dateien', 'projekt', 'planner', 'modell', 'netz', 'rezepte', 'datenbank', 'funktion', 'modells', 'neuronale', 'quellcode'],
  act: ['fuege', 'aendere', 'loesche', 'erstelle', 'schreibe', 'mache', 'losche', 'hinzu', 'geandert', 'bringt', 'suche', 'solltest'],
  thing: ['zaehler', 'text', 'einstellung', 'einstellungen', 'label', 'thema', 'option', 'seite', 'string', 'themen', 'sprachauswahl', 'format', 'alte'],
  thanks: ['danke', 'dankbar', 'nett', 'hilfreich'],
  chat: ['witz', 'wetter', 'name', 'geht', 'musik', 'essen', 'tag', 'heisst', 'alt', 'morgen', 'chat'],
  filler: ['und', 'der', 'die', 'ein', 'eine', 'von', 'in', 'dieser', 'hier', 'bitte', 'gut', 'jetzt', 'auch'],
};

const PT: Record<Role, string[]> = {
  greet: ['ola', 'bom', 'boa', 'oi'],
  ask: ['que', 'quem', 'pode', 'podes', 'onde', 'qual', 'dizer', 'quero', 'quantos', 'quais'],
  how: ['como'],
  self: ['voce', 'seu', 'sua', 'meu', 'estou', 'minhas', 'minha', 'assistente', 'meus', 'suas', 'preciso', 'faco'],
  can: ['ajuda', 'explica', 'funciona', 'capaz', 'serve', 'ajudar', 'trabalho', 'fazer', 'posso', 'poderia', 'entender', 'saber', 'sabe', 'explicar', 'acha', 'util'],
  privacy: ['dados', 'envia', 'privado', 'internet', 'chave', 'servidor', 'seguro', 'nuvem', 'informacoes', 'mensagens', 'segura', 'protegidas'],
  code: ['codigo', 'ficheiro', 'ficheiros', 'projeto', 'modelo', 'rede', 'receitas', 'base', 'planeador', 'funcao', 'arquivos', 'parte', 'metodo', 'desenvolvido', 'arquivo', 'logica', 'utilizados'],
  act: ['adiciona', 'muda', 'remove', 'cria', 'reescreve', 'faz', 'alterar', 'renomeie', 'deletar', 'reescreva', 'adicione', 'incluir'],
  thing: ['contador', 'texto', 'ajuste', 'ajustes', 'rotulo', 'tema', 'opcao', 'pagina', 'texto', 'coisa', 'padrao', 'especifico', 'definida', 'classificacao', 'configuracao', 'inteira'],
  thanks: ['obrigado', 'obrigada', 'agradeco', 'gentil', 'valeu', 'grato'],
  chat: ['nome', 'piada', 'tempo', 'estas', 'musica', 'comida', 'dia', 'anos', 'sobre', 'conversas', 'jantou'],
  filler: ['e', 'o', 'a', 'un', 'uma', 'de', 'em', 'este', 'nesta', 'por favor', 'ok', 'agora', 'tambem'],
};

const IT: Record<Role, string[]> = {
  greet: ['ciao', 'buongiorno', 'sera', 'ehi', 'salve', 'pronto'],
  ask: ['cosa', 'chi', 'sei', 'puoi', 'puo', 'quanti', 'quante', 'quali', 'dove', 'trovare', 'trova', 'ricerca', 'perche'],
  how: ['come', 'modo'],
  self: ['tuo', 'tua', 'mio', 'mia', 'io', 'miei', 'tuoi', 'utente'],
  can: ['aiuti', 'spieghi', 'funziona', 'capace', 'fare', 'posso', 'potresti', 'capacita', 'spiegare', 'aiuto', 'abilita'],
  privacy: ['dati', 'invia', 'privato', 'internet', 'chiave', 'server', 'sicuro', 'nuvola', 'carichi', 'sicurezza', 'password', 'informazioni', 'personali'],
  code: ['codice', 'file', 'progetto', 'modello', 'rete', 'ricette', 'database', 'sorgente', 'pianificatore', 'training', 'funzione', 'parte', 'neurale', 'funzioni', 'struttura'],
  act: ['aggiungi', 'cambia', 'rimuovi', 'crea', 'riscrivi', 'fai', 'aggiungere', 'elimina', 'rendi', 'introdurre', 'modifica'],
  thing: ['contatore', 'testo', 'impostazione', 'impostazioni', 'etichetta', 'tema', 'opzione', 'pagina', 'stringa', 'parametri', 'menu', 'filtro', 'parola'],
  thanks: ['grazie', 'ringrazio', 'gentile', 'grato', 'riconoscente'],
  chat: ['nome', 'barzelletta', 'tempo', 'stai', 'musica', 'cibo', 'giorno', 'anni', 'andata', 'giornata', 'oggi', 'bene', 'sentito', 'svegliati', 'senti', 'buona', 'spero'],
  filler: ['e', 'il', 'lo', 'la', 'un', 'una', 'di', 'in', 'questo', 'nel', 'per favore', 'ok', 'adesso', 'anche'],
};

const NL: Record<Role, string[]> = {
  greet: ['hallo', 'hoi', 'goedendag', 'goedenavond', 'goedemorgen', 'goedemiddag', 'dag'],
  ask: ['wat', 'bent', 'kan', 'kun', 'kunt', 'waarom', 'waar', 'hoeveel', 'weten', 'zeggen', 'welke'],
  how: ['hoe', 'manier'],
  self: ['jij', 'je', 'jouw', 'ik', 'mijn', 'hebt'],
  can: ['helpen', 'uitleg', 'werkt', 'geschikt', 'kunnen', 'bedoel', 'waarvoor', 'goed', 'vertellen', 'vind', 'hulp', 'moet', 'moeten', 'uitleggen', 'doel', 'gebruiken'],
  privacy: ['gegevens', 'sturen', 'internet', 'sleutel', 'server', 'veilig', 'wolk', 'privé', 'berichten', 'wachtwoord', 'informatie', 'zorg'],
  code: ['code', 'bestand', 'bestanden', 'project', 'model', 'netwerk', 'recepten', 'database', 'parameters', 'functie', 'componenten'],
  act: ['voeg', 'wijzig', 'verwijder', 'maak', 'hervat', 'doe', 'worden', 'doen', 'wordt', 'toevoegen', 'aanpassen', 'maken', 'verwijderen'],
  thing: ['teller', 'tekst', 'instelling', 'instellingen', 'label', 'thema', 'optie', 'pagina', 'tekenreeks', 'structuur', 'nieuw', 'nieuwe', 'veld'],
  thanks: ['dank', 'bedankt', 'hartelijk', 'aardig', 'prettig', 'beste', 'behulpzaam'],
  chat: ['naam', 'grap', 'weer', 'gaat', 'muziek', 'eten', 'over', 'vandaag', 'hoor', 'lekker'],
  filler: ['en', 'de', 'het', 'een', 'van', 'in', 'dit', 'hier', 'alsjeblieft', 'ok', 'nu', 'ook'],
};

const RU: Record<Role, string[]> = {
  greet: ['привет', 'здравствуйте', 'здравствуй', 'добрый', 'утро'],
  ask: ['что', 'кто', 'есть', 'можешь', 'умеешь', 'нужен', 'где', 'какая', 'сколько', 'много', 'знать', 'причины', 'если', 'почему', 'зачем', 'чтобы'],
  how: ['как', 'каковы', 'чем', 'какой', 'какова', 'каков', 'каково'],
  self: ['ты', 'твой', 'твоя', 'я', 'мне', 'себя', 'вы', 'мои', 'ассистент', 'тебя', 'вас', 'вашем', 'ваших'],
  can: ['помочь', 'объясни', 'работает', 'смысл', 'польза', 'помощь', 'информацию', 'могу', 'особенности', 'используется', 'можете', 'используете', 'могут'],
  privacy: ['данные', 'отправляешь', 'приватно', 'интернет', 'интернета', 'ключ', 'сервер', 'безопасно', 'облако', 'загружаешь', 'данных', 'сервере', 'хранятся', 'безопасность', 'серверы'],
  code: ['код', 'файл', 'файлы', 'проект', 'планировщик', 'модель', 'сеть', 'рецептов', 'рецепты', 'база', 'нейросеть', 'модели', 'коде', 'проекта', 'файла', 'функция', 'функцию', 'функции'],
  act: ['добавь', 'измени', 'удали', 'создай', 'перепиши', 'сделай', 'делать', 'изменить', 'удалить', 'сделать', 'сказать', 'найти', 'нужно', 'хочу'],
  thing: ['счетчик', 'текст', 'настройку', 'настройки', 'подпись', 'тему', 'вариант', 'страницу', 'строку'],
  thanks: ['спасибо', 'благодарю', 'благодарна', 'добр', 'любезно', 'очень', 'помогли'],
  chat: ['имя', 'погода', 'анекдот', 'дела', 'день', 'еда', 'музыка', 'лет', 'сегодня', 'мире', 'слушаешь', 'живой', 'общаться'],
  filler: ['и', 'в', 'на', 'это', 'мой', 'моя', 'всё', 'там', 'пожалуйста', 'хорошо', 'сейчас', 'также'],
};

const TR: Record<Role, string[]> = {
  greet: ['merhaba', 'selam', 'gunaydin', 'aksam', 'aksamlar', 'ister', 'isterim', 'istiyor'],
  ask: ['ne', 'misin', 'var', 'hangi', 'kim', 'kimsin', 'musun', 'mu', 'miyiz', 'musunuz', 'kimin', 'nerede', 'neden', 'adini', 'gerekiyor', 'hangisi'],
  how: ['nasil', 'nasilsin', 'kadar'],
  self: ['sen', 'senin', 'ben', 'benim', 'asistanin', 'yardimci', 'asistan', 'bize', 'miyim', 'oldun', 'herkese', 'dostum'],
  can: ['yardim', 'anlat', 'calisiyor', 'calisiyorsun', 'yapabilir', 'yapabilirsin', 'yapiyor', 'yapar', 'amac', 'fayda', 'gorev', 'gorevin', 'verir', 'yetenekleri', 'anlatabilir', 'verin', 'yarar', 'ozellikleri', 'bulabilirim', 'yapabilirim'],
  privacy: ['veri', 'verilerimi', 'gonder', 'gizli', 'internet', 'internetsiz', 'anahtar', 'sunucu', 'guvenli', 'bulut', 'yuklüyorsun', 'kodumu', 'yüklüyor', 'sifremi', 'guvenligi', 'verilerimin', 'sifrenin'],
  code: ['kod', 'dosya', 'proje', 'planlayici', 'model', 'ag', 'tarif', 'tarifler', 'veritabani', 'aglar', 'projenin', 'projede', 'kullanilan', 'kodda', 'modeli', 'bolumu'],
  act: ['ekle', 'degistir', 'sil', 'olustur', 'yeniden', 'yaz', 'eklemek', 'ediyorum', 'silip', 'ekleyelim', 'degistirebilir', 'degistirdigimde', 'olusturuldugunu', 'degistirmek'],
  thing: ['sayaci', 'metni', 'ayi', 'ayarlari', 'etiket', 'tema', 'secenek', 'sayfa', 'metin', 'birini', 'modelini', 'parametreleri', 'agirliklarin', 'modelindeki', 'dosyalari', 'agirliklari', 'modelinin'],
  thanks: ['tesekkurler', 'ederim', 'sag', 'sagol', 'maksadir', 'iyi', 'cok', 'naziksin', 'tesekkur'],
  chat: ['adin', 'hava', 'fikra', 'gunun', 'isler', 'muzik', 'yemek', 'yas', 'yasindasin'],
  filler: ['ve', 'bir', 'bu', 'icin', 'ile', 'da', 'de', 'lutfen', 'tamam', 'simdi', 'ayrica'],
};

const HI: Record<Role, string[]> = {
  greet: ['नमस्ते', 'नमस्कार', 'सुप्रभा', 'सुप्रभात', 'नमस्कार', 'शुभ', 'हैलो'],
  ask: ['क्या', 'कौन', 'करते', 'कौनसा', 'कितनी', 'कितना', 'कहाँ', 'कहां', 'बता', 'कितने', 'जानना'],
  how: ['कैसे', 'कैसा'],
  self: ['आप', 'तुम', 'मुझसे', 'तुम्हारा', 'मेरी', 'हूँ', 'हम', 'तुम्हारी', 'आपकी', 'आई', 'आपका', 'आपने'],
  can: ['कर', 'मदद', 'बताओ', 'समझाओ', 'सक्षम', 'दयालु', 'काम',
    // "कर सकते हो" is how the question is actually asked - "can you do" - and सकते is the
    // half of it that carries the sense. Without it two of the four words were unknown, the
    // row's oov ratio crossed the mostly-unknown threshold, and a question about what the
    // chat can do was answered with a thank you.
    'सकते', 'हो', 'सकता', 'क्षमताएं', 'सकती', 'मदत'],
  privacy: ['डेटा', 'भेजते', 'निजी', 'इंटरनेट', 'कुंजी', 'सर्वर', 'सुरक्षित', 'बादल', 'डाटा', 'सुरक्षा', 'पासवर्ड'],
  code: ['फ़ाइल', 'फाइल', 'फाइलें', 'प्रोजेक्ट', 'प्लानर', 'मॉडल', 'नेटवर्क', 'रेसिपी', 'डेटाबेस', 'कोड', 'अनुवाद', 'सी', 'फंक्शन', 'डिजाइन'],
  act: ['जोड़', 'बदल', 'हटा', 'बनाओ', 'दोबारा', 'लिख', 'दे', 'बनाएं', 'किया', 'करें', 'दें', 'अपलोड', 'करने', 'शुरू'],
  thing: ['काउंटर', 'टेक्स्ट', 'सेटिंग', 'लेबल', 'थीम', 'विकल्प', 'पेज', 'स्ट्रिंग', 'ये', 'पता', 'इसे', 'लंबा'],
  thanks: ['धन्यवाद', 'शुक्रिया', 'आभारी', 'अच्छा'],
  chat: ['नाम', 'मौसम', 'चुटकुला', 'दिन', 'खाना', 'संगीत', 'उम्र', 'हाल', 'बात', 'गाने'],
  filler: ['और', 'एक', 'यह', 'मेरा', 'का', 'में', 'है', 'मैं', 'कृपया', 'ठीक', 'अभी', 'भी', 'बहुत'],
};

const JA: Record<Role, string[]> = {
  greet: ['こんにちは', 'やあ', 'おはよう', 'こんばんは', 'あ', 'おはようございます'],
  ask: ['何', '誰', 'ですか', 'ますか', 'なん', 'どの', 'どこ', 'お元気ですか', '何か面白いことありましたか'],
  how: ['どう'],
  self: ['あなた', '私', '僕'],
  can: ['できます', '手伝', '説明', 'でき', '役立', '使い方', '動', '働'],
  privacy: ['データ', '送信', '秘密', 'インターネット', 'キー', 'サーバー', '安全', 'クラウド', '匿名'],
  code: ['コード', 'ファイル', 'プロジェクト', 'モデル', 'ネットワーク', 'レシピ', 'データベース', '翻訳', '重み'],
  act: ['追加', '変更', '削除', '作成', '書き換', '直し'],
  thing: ['カウンター', '文言', '設定', 'ラベル', 'テーマ', '選択肢', 'ページ', '文字列'],
  thanks: ['ありがとう', '感謝', '助かり'],
  chat: ['天気', '冗談', '名前', '元気', '一日', '音楽', '食べ物', '歳'],
  filler: ['は', 'を', 'に', 'で', 'と', 'の', 'ます', 'した', 'よろしく', 'はい', '今', 'も'],
};

const KO: Record<Role, string[]> = {
  greet: ['안녕', '안녕하세요', '반갑습니다', '하이', '아침', '좋은', '반가워요'],
  ask: ['무엇', '누구', '예요', '나요', '어떤', '뭐', '어디', '몇', '뭐라고', '뭔가요', '저장되나요', '어디서', '어디인가요', '궁금해요', '되는지', '알려주세요'],
  how: ['어떻게', '어때', '방법'],
  self: ['너', '당신', '저', '챗봇이'],
  can: ['할', '도와', '설명', '도움', '쓸모', '기능', '동작', '동작해요', '도움이', '역할을', '잘하는', '방법이', '쓰이는'],
  privacy: ['데이터', '전송', '비밀', '인터넷', '키', '서버', '안전', '클라우드', '비밀번호', '보내요', '보낼', '비밀키', '키가', '필요해요', '서버에', '안전하게', '데이터가', '개인정보가', '안전한가요', '서버가', '보관하나요', '비밀번호는'],
  code: ['코드', '파일', '프로젝트', '모델', '네트워크', '레시피', '데이터베이스', '번역', '가중치', '플래너', '프로젝트의', '프로젝트에서', '모델의', '파일의', '기능을', '코드에서'],
  act: ['추가', '변경', '삭제', '만들', '고쳐', '추가해', '있어', '줄래', '삭제하고'],
  thing: ['카운터', '문구', '설정', '라벨', '테마', '선택지', '페이지', '문자열', '새로운', '메시지가', '옵션을', '전체', '부분을', '항목을', '설정을'],
  thanks: ['감사', '고마워', '감사합니다', '도와줘서', '고마워요', '고맙네요'],
  chat: ['날씨', '농담', '이름', '지내', '하루', '음악', '음식', '살', '기분', '오늘', '주말에는', '올라가나요'],
  filler: ['은', '는', '를', '이', '가', '해요', '에서', '하고', '것', '제발', '네', '지금', '도', '을', '에', '에서', '한', '해', '합', '니', '요', '어', '야'],
};

const ZH: Record<Role, string[]> = {
  greet: ['你好', '您好', '早上好', '晚上好', '嗨'],
  ask: ['什么', '谁', '哪', '吗', '呢', '哪个', '你好吗'],
  how: ['怎么', '怎样', '如何'],
  self: ['你', '我', '您'],
  can: ['可以', '帮助', '说明', '能', '用途', '功能'],
  privacy: ['数据', '发送', '私密', '互联网', '密钥', '服务器', '安全', '云', '联网', '联网吗'],
  code: ['代码', '文件', '项目', '模型', '网络', '配方', '数据库', '翻译', '权重', '规划器'],
  act: ['添加', '修改', '删除', '创建', '重写', '加'],
  thing: ['计数器', '文字', '设置', '标签', '主题', '选项', '页面', '字符串'],
  thanks: ['谢谢', '感谢', '多谢', '帮忙'],
  chat: ['天气', '笑话', '名字', '多大了', '一天', '音乐', '食物', '游戏', '好吗', '最近'],
  filler: ['的', '了', '在', '是', '和', '请', '好的', '现在', '也'],
};

const ID: Record<Role, string[]> = {
  greet: ['halo', 'hai', 'selamat', 'pagi'],
  ask: ['apa', 'siapa', 'boleh', 'apakah', 'mana', 'berapa', 'kalau', 'dimana', 'nanya', 'ngapain', 'ingin'],
  how: ['bagaimana', 'gimana'],
  self: ['kamu', 'saya', 'anda', 'aku', 'kita', 'kalian'],
  can: ['jelaskan', 'bantuan', 'bisa', 'berguna', 'fungsi', 'dipakai', 'bantuanmu', 'digunakan', 'kegunaanmu', 'kerja', 'bekerja', 'fitur', 'menjelaskan', 'menggunakan', 'bantuannya'],
  privacy: ['data', 'kirim', 'pribadi', 'internet', 'kunci', 'server', 'aman', 'awan', 'keamanan', 'password', 'privasi', 'koneksi', 'risiko'],
  code: ['kode', 'berkas', 'file', 'proyek', 'model', 'jaringan', 'resep', 'basis', 'terjemahan', 'perencana', 'perencanaannya', 'rencana', 'pesan', 'bagian', 'training'],
  act: ['tambah', 'ubah', 'hapus', 'buat', 'tulis', 'perbarui', 'ganti', 'kerjakan', 'nambahin', 'bikin', 'proses', 'lakukan', 'memastikan', 'membuat'],
  thing: ['penghitung', 'teksnya', 'pengaturan', 'label', 'tema', 'opsi', 'halaman', 'karakter', 'parameter', 'bobot', 'strukturnya', 'kerjaan'],
  thanks: ['terima', 'kasih', 'makasih', 'membantu', 'bersih'],
  chat: ['nama', 'cuaca', 'lelucon', 'hari', 'makan', 'musik', 'main', 'sibuk', 'umur', 'kabar', 'namamu', 'chat', 'lagu', 'malam'],
  filler: ['dan', 'yang', 'di', 'untuk', 'ini', 'itu', 'adalah', 'tolong', 'oke', 'sekarang', 'juga'],
};

const UR: Record<Role, string[]> = {
  greet: ['سلام', 'ہیلو', 'صبح', 'بخیر', 'شب'],
  ask: ['کیا', 'کون', 'کونسا', 'کتنے', 'ہو', 'کہاں', 'کس', 'کسی', 'کیوں', 'چاہیئے', 'کہ'],
  how: ['کیسے', 'کیسا', 'طریقے', 'ذریعہ', 'کہا'],
  self: ['آپ', 'مجھ', 'ہم', 'تم', 'میری', 'آئی', 'اپنی', 'اسے', 'آپکو', 'تمہیں', 'ہماری', 'آپکے'],
  // "تم کیا کر سکتے ہیں" - "what can you do" - is the everyday Urdu phrasing, and two of its
  // five words were missing here: the familiar pronoun تم and the auxiliary سکتے ہیں that
  // makes کر mean "can do" rather than just "do". With them unknown, the row's oov ratio
  // crossed the mostly-unknown threshold and the question came back as "I do not know".
  can: ['بتائیں', 'مدد', 'کر', 'استعمال', 'فائدہ', 'کام', 'کرنے', 'سکتے', 'ہیں', 'ہوتا', 'جاسکتا', 'ورک', 'امکان', 'سمجھنے', 'کمک'],
  privacy: ['ڈیٹا', 'بھیج', 'نجی', 'انٹرنیٹ', 'کلید', 'سرور', 'محفوظ', 'بادل', 'اپ لوڈ', 'سیکرٹ', 'دیٹا'],
  code: ['کوڈ', 'فائل', 'منصوبہ', 'ماڈل', 'نیٹ ورک', 'ترکیب', 'ریسپی', 'ڈیٹابیس', 'ترجمہ', 'پلانر', 'ورڈ', 'پروجیکٹ', 'مدل', 'کمپوننٹ', 'کامپوننٹ'],
  act: ['شامل', 'تبدیل', 'حذف', 'بنائیں', 'لکھ', 'اپ ڈیٹ', 'کریں', 'چاہتا', 'کرتے', 'رہا', 'گیا', 'رکھتے', 'اپلوڈ', 'دکھائے'],
  thing: ['کاؤنٹر', 'متن', 'سیٹنگ', 'لیبل', 'تھیم', 'اختیار', 'صفحہ', 'سٹرنگ', 'نئے', 'ویر'],
  thanks: ['شکریہ', 'ممنون', 'احترام'],
  chat: ['نام', 'موسم', 'لطیفہ', 'دن', 'کھانا', 'موسیقی', 'کھیل', 'مصروف', 'عمر', 'بات', 'خبار', 'امروز', 'کل'],
  filler: ['اور', 'کی', 'یہ', 'وہ', 'سے', 'کو', 'ہے', 'کے', 'لیے', 'براہ', 'کرم', 'ٹھیک', 'اب', 'بھی'],
};

/** The sixteen interface languages, in the order the table above is written. */
const TABLES: Array<[string, Record<Role, string[]>]> = [
  ['en', EN], ['ar', AR], ['es', ES], ['fr', FR], ['de', DE], ['pt', PT], ['it', IT],
  ['nl', NL], ['ru', RU], ['tr', TR], ['hi', HI], ['ja', JA], ['ko', KO], ['zh', ZH],
  ['id', ID], ['ur', UR],
];

/**
 * Scripts that do not put spaces between words.
 *
 * Chinese and Japanese do not, so a request arrives as one unbroken run of characters and
 * there is no token to find; the only way to see the word is to look for it inside the text.
 */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Korean, which is a third case and was being handled as the first one.
 *
 * Korean does use spaces, so its words are tokens and could simply be compared as tokens.
 * It was being substring-matched along with Chinese, on the reasoning that it "costs
 * nothing", and it costs a great deal: Korean attaches its particles directly to the word,
 * so a message is full of one-syllable strings, and a vocabulary word of one syllable found
 * anywhere inside a longer one matches by accident. '너' is "you" and it sits inside
 * '플래너', the word for planner, so every Korean question about the planner lit the
 * second-person role and read as small talk about the reader. The Korean code intent was
 * being carried by a third of its messages and nothing else was.
 *
 * So Hangul is matched as a token, with one concession to the particles: a word of two
 * syllables or more may be found at the start of a token with a single character left over,
 * which is what '플래너는' - "the planner", topic marker - needs. A one-syllable entry has to
 * be the whole token, because there is no way to tell a particle from the inside of a word.
 */
const HANGUL = /\p{Script=Hangul}/u;

/**
 * Letters that carry a diacritic no amount of Unicode decomposition will separate.
 *
 * NFD handles the rest: it takes 'teşekkürler' to 'te' + s-with-cedilla + 'k' + u-with-diaeresis
 * + 'rler', and dropping the combining marks leaves 'tesekkurler'. Turkish's dotless i is the
 * exception - U+0131 is not a base letter plus a mark, it is simply a different letter, and
 * 'günaydın' would fold to 'gunayd' + dotless-i + 'n' and stay wrong. So the four that
 * decomposition cannot reach are mapped by hand.
 */
const UNDECOMPOSABLE: Record<string, string> = {
  'ı': 'i', // Turkish dotless i
  'ø': 'o', // Danish/Norwegian o
  'đ': 'd', // Croatian/Serbian d with stroke
  'ß': 'ss', // German sharp s
  'æ': 'ae', // Icelandic ae
  'œ': 'oe', // French oe ligature
  'ł': 'l', // Polish l with stroke
  'þ': 'th', // Icelandic thorn
  'ð': 'd', // Icelandic eth
};

/**
 * Fold a word down to the letters a keyboard actually produces.
 *
 * This exists because of a bug the role diagnostic caught: Turkish was routing at 44% and
 * Hindi and Portuguese at chance, and the cause was not the model. The word table was
 * written in ASCII - 'tesekkurler', 'agradeco', 'gunaydin' - because that is how these
 * languages are conventionally written without a keyboard in front of you, while the
 * training corpus was written as a speaker would spell it, with the diacritics restored.
 * 'teşekkürler' and 'tesekkurler' are the same word to a reader and two unrelated strings
 * to a string comparison, so a third of the corpus lit up no role at all and the network
 * was asked to learn a distinction that does not exist in the language.
 *
 * Folding is applied to Latin words only, and deliberately so. Stripping \p{M} everywhere
 * would be simpler and would quietly destroy Hindi, where the vowel signs are themselves
 * combining marks: 'नमस्ते' folded blindly becomes 'नमस', which is not a word. The Latin
 * letter check is what keeps that from happening, and it is why this is a function over
 * words rather than a blanket pass over the string.
 */
export {fold as foldWord};

function fold(word: string): string {
  // The first character has to be a Latin letter, not merely a member of the allowed set.
  // \p{M} is in the set because the marks are what gets dropped, but Devanagari vowel signs
  // are themselves combining marks, so a test of /^[\p{Latin}\p{M}]+$/ alone is satisfied by
  // नमस्ते and folds it to नमस - which is how Hindi was routing at chance while every
  // other fixed script worked. Anchoring on the first letter is what keeps the fold to the
  // alphabet it was written for.
  if (!/^\p{Script=Latin}/u.test(word)) return word;
  if (!/^[\p{Script=Latin}\p{M}]+$/u.test(word)) return word;
  let out = '';
  for (const ch of word.normalize('NFD')) {
    if (/\p{M}/u.test(ch)) continue;
    out += UNDECOMPOSABLE[ch] ?? ch;
  }
  return out.normalize('NFC');
}

/**
 * Every distinct word, and the role it plays, flattened into two aligned arrays.
 *
 * Deduplicated, so one spelling shared by several languages is one row: 'proyecto' is in
 * the Spanish code group and the Portuguese one is 'projeto', but 'data' is the same word
 * in English and Indonesian and 'merci' is only French. A word written into two groups
 * keeps both of its parts, which is the point - 'can' opens a capability question and a
 * privacy one. A word that would be filed under two *different* parts is a mistake in the
 * table above rather than a subtlety, and it throws here instead of quietly steering
 * messages at runtime, because a wrong turn at import is a failed build and a wrong turn
 * in a weight file is a conversation that answers the wrong question for a year.
 */
const VOCAB_MUT: string[] = [];
export const VOCAB: readonly string[] = VOCAB_MUT;
const ROLE_OF: Role[] = [];
/** How each word is looked for in a message. See the three constants above. */
const MATCH: number[] = [];
const TOKEN = 0;
const INSIDE = 1;
const HANGUL_WORD = 2;
/** The same words folded, which is what matching and the coverage count work on. */
const VOCAB_FOLD: string[] = [];
/** Folded vocabulary as a set, for deciding whether a word the reader typed is one we know. */
const VOCAB_SET = new Set<string>();
{
  const role = new Map<string, Role>();
  const conflicts: string[] = [];
  for (const [, table] of TABLES) {
    for (const r of ROLES) {
      for (const raw of table[r]) {
        const w = fold(raw);
        const already = role.get(w);
        if (already) {
          if (already !== r) {
            // Every collision is collected rather than thrown on the first, because a
            // table this size is fixed one message at a time and being told about one
            // wrong word per run is a slow way to find a mistake in sixteen languages.
            conflicts.push(`"${raw}" is filed as both '${already}' and '${r}'`);
          }
          continue;
        }
        role.set(w, r);
        VOCAB_MUT.push(raw);
        VOCAB_FOLD.push(w);
        VOCAB_SET.add(w);
        ROLE_OF.push(r);
        MATCH.push(HANGUL.test(w) ? HANGUL_WORD : UNSPACED.test(w) ? INSIDE : TOKEN);
      }
    }
  }
  if (conflicts.length) {
    throw new Error(
      `ai/chat-router: ${conflicts.length} word(s) filed under two parts of the ` +
      `sentence. A word has to mean one part.\n  ${conflicts.join('\n  ')}`,
    );
  }
}

/**
 * Endings that a reader adds to a word we already know, mapped back to the word.
 *
 * The tables hold lemmas, because that is the shortest honest way to write sixteen
 * vocabularies by hand, but nobody types lemmas. They type 'sirves', 'fichiers',
 * 'yapabilirsin' and 'dateien'. Without this, every inflected form counts as an unknown
 * word, and the out-of-vocabulary feature - the thing that separates a question the chat
 * cannot answer from one it can - quietly starts firing on ordinary sentences in the
 * languages with the richest morphology. That is not a rounding error: the first run of
 * this design put Spanish at 62.5% held out while English passed, and the Spanish errors
 * were almost all words the table plainly contained one letter short of.
 *
 * It is deliberately a suffix list and not a stemmer. A real stemmer needs a per-language
 * rule set, and getting one wrong mangles words in a way that is very hard to see; a
 * suffix list only ever *adds* a match to a word already in the vocabulary, so the worst
 * case is a word matched slightly too eagerly rather than a language silently broken.
 * The remainder has to be three characters or more, which keeps 'was' from being read as a
 * form of 'wa' and stops short words from matching everything.
 */
const ENDINGS = ['s', 'es', 'en', 'er', 'e', 'n', 'i', 'a', 'ar', 'as', 'is', 'em', 'y'];

/** Folded form a reader might type -> the vocabulary words it stands for. */
const FORMS: Map<string, number[]> = new Map();
{
  const add = (form: string, index: number) => {
    const list = FORMS.get(form);
    if (list) list.push(index);
    else FORMS.set(form, [index]);
  };
  for (let i = 0; i < VOCAB_FOLD.length; i++) {
    const w = VOCAB_FOLD[i];
    if (w.length < 4 || !/^\p{Script=Latin}\p{M}*$/u.test(w)) continue;
    add(w, i);
    for (const ending of ENDINGS) {
      if (!w.endsWith(ending) || w.length - ending.length < 3) continue;
      add(w.slice(0, w.length - ending.length), i);
    }
  }
}

/** What the chat knows about the reader's situation, which changes what it can say. */
export type ChatContext = {
  /**
   * Project files this build knows the names of, compiled in from the planner's own list.
   *
   * Names, not contents. The chat has read no file, and the reply library is careful to
   * say so; what this buys is the difference between "that file is not part of this
   * project" and "I have not read it", which are different answers and only one of them
   * is a guess.
   */
  files: string[];
  /** Whether the reader can reach the agent, which is what the edit replies point at. */
  canWrite: boolean;
  /** Whether this account owns the agent. */
  isOwner: boolean;
};

/**
 * Shape of the message, and the situation around it.
 *
 * Declared after the two lists it counts, so it cannot fall into the temporal dead zone
 * the way a constant near the top of a file did once already in planner.ts. The size is
 * derived for the same reason: adding a word to the vocabulary cannot silently leave the
 * tail of the vector truncated, and a truncated shape block is exactly how the planner's
 * copy and i18n recipes became indistinguishable once.
 */
const ROLE_PRESENT = ROLES.length;
const ROLE_COUNT = ROLES.length;
const SHAPE_FEATURES = 6;
const FOCUS_FEATURES = 8;
const CONTEXT_FEATURES = 3;
export const CHAT_FEATURE_SIZE =
  ROLE_PRESENT + ROLE_COUNT + SHAPE_FEATURES + FOCUS_FEATURES + CONTEXT_FEATURES;

/**
 * The vocabulary is closed, and that is a decision, not an oversight.
 *
 * Everything above answers "which of these words are present", so a word nobody wrote down
 * contributes nothing. The obvious way round that is to hand the network the text itself -
 * hashed character trigrams over the folded message - and it does work, and it was tried:
 * 192 buckets took the feature vector from 41 to 233, dropped the genuinely inseparable
 * rows from 41% of the corpus to eleven keys out of 4,884, and made the training set
 * perfectly learnable. Train accuracy went to 84% and then stopped climbing, and on
 * phrasings the network had not been fitted on it scored 53%.
 *
 * That gap is the whole argument. A trigram from a sentence nobody wrote down lands in a
 * bucket that some unrelated trigram was trained on, so at inference the block contributes
 * confident nonsense rather than silence - the router memorised the corpus and lost the
 * ability to read a new sentence. More buckets trade that for a weights file big enough
 * to be a download, which is the thing this design exists to avoid.
 *
 * So the corpus is not fed to the network; it is used to widen this table, by finding the
 * words real readers use and filing each one under the role it belongs to. The features
 * stay few and the words stay meaningful, so a message is routed by what it says rather
 * than by which substring of it the network saw most often. See scripts/mine-vocab.mjs.
 */

/**
 * The roles that say what a sentence is *about*, as opposed to the one that says it is
 * well-formed English.
 *
 * 'filler' is the odd one out in the table and is left out of this deliberately. A polite
 * word in front of a question changes nothing about what the question is about, and
 * counting it here is what made the noise-augmented rows unlearnable: the first version
 * added up every role that was present, so 'how do i change a tyre' and 'so how do i
 * change a tyre please' were different messages as far as the network was concerned, and
 * with five repetitions of every template in the corpus the network learned the five
 * specific vectors rather than the sentence behind them.
 */
const CONTENT_ROLES: readonly Role[] = ['can', 'privacy', 'code', 'act', 'thing', 'chat'];

// A path, a filename with an extension, or a bare code noun.
//
// The role table catches the words people use for a file, but not the name of one: "what
// does src/Agent.tsx do" tokenises to src, agent and tsx, and none of those is a code-word
// in any language here. The extension has to be matched without a leading \b, because in
// "Agent.tsx" the dot sits between two non-word characters and there is no boundary in
// front of it - the first version of this pattern required one, and so silently failed on
// every real filename in the project while looking correct in a test with a leading dot.
const FILEISH = /(\b(?:src|supabase|scripts)\/)|[\w./-]*\.(?:tsx?|css|sql|mjs|json)\b|\b(?:file|module|component|function|codebase|source|schema|recipe|weight|parameter|engine|locale|translation)\b/;

/**
 * Three question marks, not one.
 *
 * '?' is ASCII. Arabic sets it on the baseline as U+061F and East Asian text as the
 * fullwidth U+FF1F, and a reader typing in their own language presses their own keyboard's
 * key. The single strongest signal that a message is asking rather than instructing is
 * the one that would otherwise be missing for most of them.
 */
const QUESTION = /\?|؟|？/;

/**
 * Arabic's definite article, which prefixes the noun and is written as one word.
 *
 * 'الملف' is 'the file' and 'ملف' is 'file', and to a string comparison they are unrelated.
 * Every Arabic question about the project says 'the file' or 'the planner' rather than the
 * bare noun, so without this the whole Arabic code intent was unreachable - three of the
 * locale's eight intents matched nothing at all. The article is stripped when a token
 * starts with it and has a stem left over, which is the same test a reader would apply.
 */
const ARABIC_DEFINITE = /^ال(.+)$/u;

export function features(text: string, ctx: ChatContext): Float64Array {
  const x = new Float64Array(CHAT_FEATURE_SIZE);
  // Unicode letters, digits and marks are kept and everything else is a separator,
  // because the first version of this line kept [a-z0-9] only - which meant a message in
  // Arabic, Russian, Hindi, Japanese, Korean or Chinese was reduced to its punctuation
  // before the vocabulary ever saw it, and every non-Latin reader was told the chat did not
  // understand them. It was not a limitation of the model, it was the tokenizer.
  //
  // \p{M} is in the kept set and is the second half of that sentence. A combining mark is
  // neither a letter nor a digit, so [^\p{L}\p{N}] treats it as punctuation - and in
  // Devanagari the virama and the vowel signs are combining marks, which means 'नमस्ते' was
  // being split into 'नमस' 'त' 'े' and no longer matched the word in the table. Hindi routed
  // at zero on every intent while every other script worked, and the table was fine
  // throughout; the separator was eating the middle of the words.
  //
  // Split first, fold second. Folding the whole message in one go was the first attempt,
  // and it folded nothing: fold() is guarded to Latin words, a two-word message contains a
  // space, the space fails the guard, and the entire string came back with its diacritics
  // intact - so 'sağ ol' and 'नमस्ते' matched nothing while the vocabulary, built word by
  // word, was folded correctly and simply unreachable. The unit of folding is the word.
  const words = text
    .trim()
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean)
    .map(fold);
  const bare = words.join(' ');
  const lower = ' ' + bare + ' ';
  // Where each word starts in `bare`, so the coverage count below can mark the characters
  // an inflected form accounted for. The same shape as the sentence with a space between
  // words, which is what lets a token be found by index arithmetic rather than by searching
  // for it again.
  const starts: number[] = [];
  let at = 0;
  for (const w of words) {
    starts.push(at);
    at += w.length + 1;
  }
  // The same words with a leading Arabic article dropped, so a vocabulary entry can be
  // found in either form without the table having to carry both spellings.
  const unstated = ' ' + words.map((w) => w.replace(ARABIC_DEFINITE, '$1')).join(' ') + ' ';

  const seen = new Uint8Array(ROLES.length);
  const counts = new Float64Array(ROLES.length);
  const roleIndex = new Map<Role, number>(ROLES.map((r, i) => [r, i]));

  // For the coverage count below: which characters of the message some vocabulary word
  // accounted for. Tracked by character rather than by token because Chinese and Japanese
  // arrive as one unbroken token, where a token-level count is always either zero or one.
  const covered = new Uint8Array(bare.length);

  for (let i = 0; i < VOCAB.length; i++) {
    const w = VOCAB_FOLD[i];
    let hit = false;
    if (MATCH[i] === INSIDE) {
      const at = bare.indexOf(w);
      if (at >= 0) {
        hit = true;
        covered.fill(1, at, at + w.length);
      }
    } else if (MATCH[i] === HANGUL_WORD) {
      for (let t = 0; t < words.length; t++) {
        const tok = words[t];
        if (tok === w) {
          hit = true;
          covered.fill(1, starts[t], starts[t] + tok.length);
          continue;
        }
        // A word of two syllables or more, found at the start of a token with a single
        // character left over: that leftover is a particle, and it is how a Korean noun
        // arrives in a sentence. '플래너는' is "the planner" and '뭐를' is "what", and
        // without this the particle is counted as an unknown word, which put almost every
        // Korean sentence above the out-of-vocabulary threshold that separates a question
        // the chat can answer from one it cannot.
        if (w.length < 2 || tok.length - w.length !== 1 || !tok.startsWith(w)) continue;
        hit = true;
        covered.fill(1, starts[t], starts[t] + w.length);
      }
    } else {
      hit = lower.includes(' ' + w + ' ') || unstated.includes(' ' + w + ' ');
      // A word repeated is a stronger signal than a word mentioned once, which is what
      // separates "what can you do" from a passing "do" in the middle of a code question.
      if (!hit && w.length > 3) hit = lower.split(' ' + w + ' ').length - 1 > 1;
      if (hit) {
        let at = lower.indexOf(' ' + w + ' ');
        while (at >= 0) {
          covered.fill(1, at + 1, at + 1 + w.length);
          at = lower.indexOf(' ' + w + ' ', at + 1);
        }
        const b = unstated.indexOf(' ' + w + ' ');
        let u = b;
        while (u >= 0) {
          covered.fill(1, u + 1, u + 1 + w.length);
          u = unstated.indexOf(' ' + w + ' ', u + 1);
        }
      }
    }
    if (!hit) continue;
    const at = roleIndex.get(ROLE_OF[i])!;
    seen[at] = 1;
    counts[at]++;
  }

  // The same pass again, this time by token and through the ending table, which is what
  // catches the word we know written the way a reader writes it. Only the roles are taken
  // from here; the count is not, because a doubled form of one word is still one mention of
  // it and inflating the count would read as emphasis the reader never intended.
  for (let t = 0; t < words.length; t++) {
    const indexes = FORMS.get(words[t]);
    if (!indexes) continue;
    for (const i of indexes) {
      const r = roleIndex.get(ROLE_OF[i])!;
      if (seen[r]) continue;
      seen[r] = 1;
      counts[r]++;
    }
    covered.fill(1, starts[t], starts[t] + words[t].length);
  }

  // Two features per role: is it there at all, and how much of it is there. The second is
  // what tells "add a setting" from "add a setting and a theme", and it is capped at three
  // because the difference between four and five words of the same role is not one a
  // message's meaning turns on.
  for (let r = 0; r < ROLES.length; r++) {
    x[r] = seen[r];
    x[ROLE_PRESENT + r] = Math.min(3, counts[r]) / 3;
  }

  const shape = ROLE_PRESENT + ROLE_COUNT;

  // A question mark is the single strongest signal that a message is asking for
  // information rather than issuing an instruction, and the two are routed very
  // differently: one is answered, the other is handed to the agent.
  x[shape] = QUESTION.test(text) ? 1 : 0;
  // Length, in units the reader's own script can be counted in. Chinese and Japanese put
  // a whole clause in a handful of characters, so counting words would call a complete
  // question short; counting English sentence long.
  x[shape + 1] = Math.min(1, UNSPACED.test(text)
    ? [...text.trim()].length / 12
    : text.trim().split(/\s+/).length / 5);
  // A file path or a code noun is what makes a question about the project rather than
  // about the assistant, and it is the one signal the role table cannot carry, because
  // the words that mark it are proper nouns.
  x[shape + 2] = FILEISH.test(text) ? 1 : 0;

  /**
   * How much of the message is not in the vocabulary at all.
   *
   * This is the feature that makes 'unknown' a class the network can actually reach.
   * Roles answer what a sentence is made of, and "what is the capital of france" and
   * "what can you do" are made of exactly the same parts - an ask, a filler, nothing
   * else - so no amount of role bookkeeping separates them, and the diagnostic reports
   * them as a permanent clash. What does separate them is that half the words in the first
   * are words this table has never heard of. A question about the capital of France is
   * mostly about France; a question about the chat is mostly made of the words the chat
   * knows. Coverage is the honest signal here, and it generalises to a phrasing nobody
   * wrote a template for, which a word list cannot.
   */
  let knownChars = 0;
  for (let i = 0; i < covered.length; i++) knownChars += covered[i];
  const oov = bare.length ? 1 - knownChars / bare.length : 1;
  x[shape + 3] = oov;
  /**
   * The same fact as a threshold, and it earns its place.
   *
   * One continuous number gives the network a single place to put a decision boundary, and
   * the boundary it chose sent two ordinary questions to the wrong place: "какая столица
   * перу" (what is the capital of Peru) came back as a capabilities question at 98% and
   * "ペルーの首都はどこですか" as a question about the code at 100%. Both are mostly words
   * the table has never heard - Peru, a capital, the rules of a game - and both were
   * answered as if they were about the assistant.
   *
   * A second copy of the same signal, sharpened, lets the network put a firm edge at "most
   * of this is not vocabulary" without giving up the graded version for the cases that sit
   * either side of it. The number here is a half, deliberately: a question about the
   * capital of Peru is two-thirds unknown words, and a question about the planner is
   * usually none, so the interesting cases are not near the middle.
   */
  x[shape + 4] = oov >= 0.5 ? 1 : 0;
  x[shape + 5] = 1; // bias

  /**
   * What the sentence is about, as opposed to what it is made of.
   *
   * Everything above this block answers a question about the words. These eight answer a
   * question about the sentence, and they are here because the network could not work them
   * out for itself.
   *
   * The reason is the shape of the problem rather than the size of the network. The twelve
   * role bits and the six shape features are all that stood between a 64-unit hidden layer
   * and eight classes that overlap almost completely: "how are you" and "how do i change a
   * tyre" both light up a question word, a second-person word and a filler, and the only
   * thing standing between them is a verb and an object the table has never heard. To
   * separate them the hidden layer has to discover a conjunction - a second-person word with
   * a verb of making a change and no question mark - out of a 33-dimensional input, with
   * 3,252 rows to do it in, and it had to rediscover the same conjunction separately in
   * every one of sixteen languages because the words that express it differ in all of
   * them. It reached 99.5% on the training rows and 97.2% on the held-out ones, which is
   * the signature of a network that had memorised the corpus rather than read it.
   *
   * Written out as features, the conjunction is one multiply instead of several hundred
   * weights agreeing to invent it, and it holds in a language the table has never seen
   * because it is a statement about roles rather than about words. That is also why these
   * are conjunctions and thresholds rather than a wider table: a new word would only have
   * reached one of the sixteen languages, whereas a new role combination reaches all of
   * them at once.
   *
   * The rules the file's own header calls "eight ways of being wrong" are the ones written
   * here. They are deliberately not exhaustive - there is no feature for every pairing a
   * reader could produce - because the ones that are missing are exactly the ones where a
   * feature would be a guess about the language, and a wrong guess costs the held-out
   * number more than the missing case gains it.
   */
  const fbase = shape + SHAPE_FEATURES;

  // How much of the sentence is about something. Normalised over the six content roles, so
  // a two-word greeting and a two-clause question both land inside 0..1.
  let content = 0;
  for (const r of CONTENT_ROLES) content += seen[roleIndex.get(r)!];
  x[fbase] = content / CONTENT_ROLES.length;

  // The share of the sentence that is only well-formed grammar. This is the gibberish
  // detector, and it is a better one than coverage: 'qwert zxcv please' is three unknown
  // words and one polite one, and coverage reads it as 71% unknown, but 'как тебя зовут'
  // is three perfectly ordinary Russian words about the assistant and coverage reads that
  // as 62% unknown too, because the table has no Russian for 'are you called'. The ratio
  // separates them without needing the table to know the language.
  let live = 0;
  for (let r = 0; r < ROLES.length; r++) live += seen[r];
  x[fbase + 1] = live ? seen[roleIndex.get('filler')!] / live : 0;

  // "how do I change a tyre" and "how to fix a bike". A question about method with a verb of
  // making a change in it is the reader asking the world, not the assistant - and it is the
  // single most common way a message the chat cannot answer arrives, because "how do I X"
  // is a sentence shape every language has and the table has nothing to say about any of
  // the Xs.
  x[fbase + 2] = seen[roleIndex.get('how')!] && seen[roleIndex.get('act')!] ? 1 : 0;

  // A question addressed at the assistant. Whether it ends up as capabilities or as
  // smalltalk is decided by what is being asked about, and the two features below split it.
  x[fbase + 3] = seen[roleIndex.get('self')!] && QUESTION.test(text) ? 1 : 0;

  // The assistant as the subject with nothing in the sentence about code, changing
  // something or data: 'what is the point of you', 'how are you'. This is the shape of
  // every question that is about the assistant rather than about the work, and it is what
  // 'what is the point of you' was missing - it carries a question word and a second-person
  // word and a filler and no topic at all, which put it on the unknown side of a boundary
  // drawn by topic words it does not have.
  x[fbase + 4] = seen[roleIndex.get('self')!]
    && !seen[roleIndex.get('code')!]
    && !seen[roleIndex.get('act')!]
    && !seen[roleIndex.get('privacy')!]
    && !seen[roleIndex.get('thing')!] ? 1 : 0;

  // A question about the project rather than a request to change it. 'what does
  // src/Agent.tsx do' is a code question and 'add a setting to src/Agent.tsx' is an edit,
  // and the only thing separating them in the words is the question mark - which is why
  // 'сколько файлов' ('how many files') was answered as a capabilities question at 100%.
  x[fbase + 5] = seen[roleIndex.get('code')!]
    && !seen[roleIndex.get('act')!]
    && (QUESTION.test(text) || seen[roleIndex.get('ask')!]) ? 1 : 0;

  // An instruction rather than a question: a verb of making a change with an object.
  x[fbase + 6] = seen[roleIndex.get('act')!] && seen[roleIndex.get('thing')!] ? 1 : 0;

  // A question the table has almost no words for. Coverage below a half still means the
  // same thing - the reader is asking about something that is not in this table - so the
  // edge belongs lower than the shape block's own threshold, and the two are kept
  // deliberately inconsistent so the network is not asked to fit one boundary twice.
  x[fbase + 7] = QUESTION.test(text) && oov >= 0.4 ? 1 : 0;

  const cbase = fbase + FOCUS_FEATURES;

  // Situation. A chat with no file names in hand cannot honestly claim to know the
  // project, so the answer has to be different, and telling the network that is more
  // honest than letting it guess from the words.
  x[cbase] = ctx.files.length ? 1 : 0;
  x[cbase + 1] = ctx.canWrite ? 1 : 0;
  x[cbase + 2] = ctx.isOwner ? 1 : 0;

  return x;
}

/**
 * One network with one output per intent, so the eight compete.
 *
 * The same argument as the planner's, and for the same reason: "what does this do" and
 * "what is this file" share the ask and the code, and independent binary classifiers each
 * see their own evidence and neither learns to defer. Softmax over eight logits is what
 * makes the comparison happen.
 */
export function probs(text: string, ctx: ChatContext): Float64Array {
  return softmax(forwardAll(CHAT_WEIGHTS as Network, features(text, ctx)));
}

/** The intent, and how sure the network is. */
export function route(text: string, ctx: ChatContext): {intent: Intent; confidence: number; unknown: number} {
  const p = probs(text, ctx);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  return {
    intent: INTENTS[best],
    confidence: p[best],
    unknown: p[INTENTS.indexOf('unknown')],
  };
}
