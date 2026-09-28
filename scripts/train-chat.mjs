// Trains the chat's intent classifier and writes src/ai/chat-weights.ts.
//
//   npm run train:chat
//
// Run this after changing the vocabulary or the feature layout in src/ai/chat-router.ts.
// The weights are committed, so a reader never trains anything and never downloads
// anything; this script is the whole build step, and it is deterministic, so re-running it
// on an unchanged tree reproduces the committed file byte for byte.
//
// Plain JavaScript on purpose: Node strips types out of imported .ts modules but not out
// of this file, which is .mjs like every other script here.
//
// ─────────────────────────────────────────────────────────────────────────────
// What is actually being learned, stated plainly
// ─────────────────────────────────────────────────────────────────────────────
//
// The network does not learn what to say. That is written down, in src/ai/chat.ts, as one
// fixed sentence per intent in the reader's own language, plus the four grounded answers
// about the project that are assembled from numbers and paths read out of the real code.
//
// What the network learns is which of the eight intents a message is, and it learns it
// from the overlap. "What can you do" and "what does Agent.tsx do" are both questions that
// open with "what"; "how are you" and "how do you work" are both how-questions with a
// second person in them; "add a streak counter" and "what would you add for a streak
// counter" are the same request phrased as a question. Those pairs are the whole
// difficulty, and a lookup table keyed on "does it contain 'what'" cannot separate any of
// them - the hidden layers exist to hold the interactions, exactly as they do in the hint
// ranker and the planner.
//
// So: the wording is ours and the model is real, but this is a router over a hand-written
// library of answers, not a language model. It cannot write prose and is not asked to.
// What it does is decide which sentence you meant, and it is wrong in a way that shows.
//
// The corpus is synthetic, and that is worth being blunt about, for the same reason
// train-planner.mjs says it: the honest version of this problem is "messages people
// actually send", and there are none to collect, because this project has had one user.
// So the training set is generated from templates varying the phrasing, with unrelated
// words mixed in. It teaches the classifier the vocabulary and the shape of these eight
// intents, not the way anyone in particular words things. It will get an unfamiliar
// phrasing right when the words overlap, and it will say "I did not follow that" when they
// do not - which is the failure mode worth having, because a chat that guesses answers the
// wrong question with a confident sentence.
import {writeFileSync, readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {network, forwardAll, softmax} from '../src/ai/engine.ts';
import {features, CHAT_FEATURE_SIZE, INTENTS, ROLES} from '../src/ai/chat-router.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'ai', 'chat-weights.ts');
const EPOCHS = 1200;
const LR = 0.03;
const BATCH = 24;

/**
 * Label smoothing was tried here, at 0.1, and taken back out.
 *
 * The reason to try it is real. The network fits this corpus to a loss of 0.0027, the
 * logits are enormous, and the softmax therefore returns 0 and 1 and nothing in between -
 * every probability the router produces on a sentence it has not seen is either 0.000 or
 * 1.000, which is why the CONFIDENT threshold in src/ai/chat.ts fires on five of 1,645
 * real sentences and not on more. Smoothing does fix that: "not sure" went from 0.3% to
 * 3.9% of real sentences, the threshold started doing the job it was written for, and
 * held-out accuracy on the template set rose from 97.0% to 97.5%.
 *
 * It was removed because the thing it fixed was not the thing that was broken. On real
 * sentences the argmax fell from 46.7% to 39.9%, the router answered fewer of them, and
 * the number of correct answers dropped from 442 to 383 out of 1,645. Smoothing bought a
 * more honest-looking confidence number by making the underlying classifier worse at its
 * actual job, and a router that says "not sure" more often while getting strictly less
 * right is not more careful, it is just less useful.
 *
 * The real gap is not calibration. It is that this corpus is template sentences and real
 * players do not send template sentences, and nothing measured here closes that: teacher
 * rows trained on directly scored 92-93% here and 46-53% out there, hashed trigrams
 * memorised their way to 53%, and mined vocabulary bought 46.7% to 49.0%. The classifier
 * is good at the corpus and the corpus is not the world.
 */
// Two hidden layers rather than one, which is affordable precisely because the feature
// vector is small: the word table collapsed 1146 vocabulary entries down to 24 role
// features, so the network no longer has to spend its capacity memorising sixteen
// vocabularies. What it has left to do is compose them - a code word between an ask and a
// self, a capability word beside a how - and composing two things needs an intermediate
// layer to compose into.
//
// Wider than that sounds necessary, and it is: held-out accuracy sat at 98.2% with 48
// units and dropped to 95.7% when four legitimate templates were added, which is not what
// more data should do. The errors that moved were not new mistakes but *old points changing
// class* - sentences whose feature vector is duplicated elsewhere in the corpus with a
// different label, being decided by a hidden layer with too few units to carve out the
// boundary. The fix for "the corpus now has more near-collisions in it" is room to put the
// boundary, not fewer sentences.
//
// 128 and 64, up from 64 and 32, because the features grew. The hashed-trigram block took
// the input from 41 to 233, and the corpus from 3,252 rows to 8,204 - real sentences in
// sixteen languages rather than tables, which is a harder fit than the templates ever were.
// At 64/32 the network reached only 80% on its own training data, and no learning rate
// fixes rows it does not have the room to separate.
//
// The size is still a file nobody has to download. A forward pass is
// 233*128 + 128*64 + 64*8 = 34,432 multiply-adds, which is microseconds on the phone this
// runs on, and the committed weights are about 38,800 numbers.
//
// Back to 64 and 32 now that the trigram block is gone. 4,488 parameters, and the held-out
// number it produced - 97.2% - is the one this router is built on.
const HIDDEN = [64, 32];

// ─────────────────────────────────────────────────────────────────────────────
// The corpus
// ─────────────────────────────────────────────────────────────────────────────

/** One sentence per intent, in several ways of saying it. */
const TEMPLATES = {
  greeting: [
    'hi', 'hello', 'hey', 'hello there', 'hi there', 'hey agent', 'good morning',
    'good evening', 'good afternoon', 'hi!', 'hello, are you there', 'hey how are things',
    'greetings', 'morning', 'evening', 'yo', 'hello agent', 'hi chat', 'hey there',
    'good day to you', 'hello again', 'anyone there', 'hi hi',
  ],
  capabilities: [
    'what can you do', 'who are you', 'how do you work', 'what are you for',
    'can you help me', 'what can this chat do', 'help', 'what are you', 'how do i use this',
    'what do you do', 'what are you capable of', 'what should i ask you', 'explain yourself',
    'what is the point of you', 'how does this work', 'what can i say to you',
    'what are your features', 'how do i work', 'what does this page do', 'what is this for',
    'what are you useful for', 'what should you be used for', 'what is your job here',
    'what can you actually do',
  ],
  privacy: [
    'do you send my data anywhere', 'do you need an api key', 'are you offline',
    'do you download a model', 'is this safe', 'do you track me', 'do you need internet',
    'are you a real ai', 'do you phone home', 'is my data private', 'do you need a server',
    'does this work without internet', 'are you sending anything', 'do you use a cloud model',
    'is my code private', 'do you need the internet', 'does this cost anything',
    'are my messages saved', 'do you have a key', 'are my files uploaded',
    'is my password stored', 'does this work on a plane', 'is anything sent to a server',
    'do you see my screen',
  ],
  code: [
    'what does src/Agent.tsx do', 'how many recipes are there', 'where is the planner',
    'what is the ai model', 'how does the hint ranker work', 'what files does it read',
    'how big is the network', 'what is in i18n.ts', 'explain the schema',
    'how many parameters does it have', 'what is supabase used for', 'what does the engine do',
    'where are the translations', 'how is the model trained', 'what is in chat.ts',
    'how many locales are there', 'what does styles.css hold', 'where is the database schema',
    'how many hints can it give', 'what is the difference between hint and planner',
    'what does App.tsx contain', 'how many parameters are in the model',
    'what does the planner rank', 'how many files are in the project', 'what is supabase for',
    'which files does the agent read',
    // The overview question, given its own lines because it is the phrasing that should
    // reach the "here is what I have in hand" answer and nothing above teaches the network
    // that such an answer exists: every template above names one specific file, so the whole
    // intent had learned that a question about the project means a question about one file,
    // and "what do you know about this project" came back as a privacy question instead.
    'what do you know about this project', 'which files does this build know',
    'what files are in this project', 'what can you tell me about the code',
  ],
  edit: [
    'add a streak counter', 'change the string text', 'rename a label', 'add a new theme',
    'remove a setting', 'create a new locale', 'update the copy', 'add a toggle to the profile page',
    'change the wording of a string', 'add another translation', 'delete a theme',
    'introduce a new setting', 'add a label', 'make a new string', 'rewrite the intro text',
    'add a dark mode option', 'change the title', 'add a second counter to the page',
    'create a dark theme', 'remove the toggle', 'add a locale for japanese', 'rewrite a setting name',
  ],
  thanks: [
    'thanks', 'thank you', 'cheers', 'thanks a lot', 'appreciate it', 'thanks, that helped',
    'nice one', 'perfect, thanks', 'thank you so much', 'thanks!', 'great, thanks',
    'that is helpful, thanks', 'cheers mate', 'thanks a bunch',
    'thanks, you are the best', 'that helped, thank you', 'lovely, thanks', 'thanks for that',
  ],
  smalltalk: [
    'how are you', 'tell me a joke', 'what is your name', 'whats the weather like',
    'what should i do today', 'do you like music', 'are you busy', 'what is your hobby',
    'how was your day', 'do you have a favourite film', 'what is your name',
    'tell me something interesting', 'are you happy today', 'do you play games',
    'what do you do for fun', 'whats your favourite food', 'how old are you',
    'what is your favourite colour', 'do you get bored', 'what did you do today',
    'are you having a good day', 'do you like films',
  ],
  // The class that has to work. Every one of these is a real message a person could send
  // that this chat has no answer for, and several share vocabulary with a real intent on
  // purpose: "what is 2 plus 2" opens with "what" like a capabilities question, and "what
  // is the capital of france" is a perfectly good question that is still not one this
  // library can answer honestly. The coverage feature is what tells them apart, and these
  // rows are where that has to be learned - an unknown row made only of words the table
  // knows would teach the class nothing.
  unknown: [
    'asdkjh qwe zxc', 'lorem ipsum dolor sit amet', 'what is 2 plus 2', 'what is the capital of france',
    'how do i bake bread', 'what time is it', 'xyzzy', 'purple monkey dishwasher',
    'tell me about the roman empire', 'blah blah blah blah', 'test test test', 'foo bar baz',
    'who won the world cup in 1998', 'what is the weather in tokyo', 'how tall is everest',
    // "ok" used to be in this list, which asked the network to learn that a sentence of
    // nothing but filler is an unknown question - while "ok" sat in the EN filler table, so
    // the row had no unknown word in it to carry that meaning. It landed in a bare corner
    // of feature space and got whatever the neighbouring corner happened to say: a held-out
    // "ok" came back as a code question. A message that short has no question in it at all,
    // and a real one would just be greeted, so the corpus has no business claiming
    // otherwise.
    'what is my password', 'give me a recipe for lasagna', 'asdfghjkl', 'qwert zxcv',
    'what is the population of peru', 'when did the war end', 'zzzz', 'hello123',
    'can you write me a poem', 'what is the meaning of life', 'nothing', 'yes', 'no',
    'the mitochondria is the powerhouse of the cell', 'what is 10 divided by 3',
    'who is the president of peru', 'how do i fix a bike tyre', 'what is the boiling point of water',
    'what is the largest country in africa', 'how do i change a tyre', 'who was einstein',
    'what language is spoken in brazil', 'when was the eiffel tower built',
    'what is the capital of japan', 'how do i make sourdough', 'write me a python script',
    'what is 7 times 8', 'translate this into klingon', 'what is my mothers name',
    'how do i pass this exam', 'what are the lyrics to that song',
  ],
};

/**
 * The same eight intents, written out in each of the other fifteen languages.
 *
 * This is the part that decides whether "translation support" means anything. A reply
 * library in sixteen languages is only half of it: if the classifier was trained on English
 * then a reader who types Arabic gets the Arabic rendering of whatever English sentence
 * their Arabic question was mistaken for, which is a confidently wrong answer in their own
 * language - worse than the raw key it replaces, because it looks like it understood.
 *
 * So the corpus carries the eight intents in every language the interface is written in,
 * with the same overlap built in: a capabilities question and a code question both open
 * with the local word for "what", and a greeting and a thanks both share the local word
 * for "you". The network has to learn the rest of the sentence, in a script it may not
 * even separate with spaces, which is the problem it is actually for.
 *
 * The templates are keyed by language, not derived. Translating a corpus by substitution
 * would produce sentences no speaker would write, and the classifier would learn the
 * grammar of the substitution rather than of the language.
 */
const LOCALES = {
  ar: {
    greeting: ['مرحبا', 'السلام عليكم', 'صباح الخير', 'مساء الخير', 'أهلا'],
    capabilities: ['ماذا تستطيع أن تفعل', 'كيف تعمل', 'من أنت', 'ماذا تفعل', 'لماذا أنت هنا'],
    privacy: ['هل ترسل بياناتي', 'هل تحتاج إلى مفتاح', 'هل يعمل بدون إنترنت', 'هل بياناتي آمنة', 'هل ترسل أي شيء'],
    code: ['ماذا يفعل الملف Agent.tsx', 'أين المخطط', 'كم عدد الوصفات', 'كم ملفا يوجد', 'ما هو النموذج'],
    edit: ['أضف عداد تتابع', 'غيّر النص', 'احذف إعدادا', 'أنشئ سمة جديدة', 'أضف لغة جديدة'],
    thanks: ['شكرا', 'شكرا جزيلا', 'ممون', 'جزيل الشكر', 'ممتن جدا'],
    smalltalk: ['ما اسمك', 'كيف كان يومك', 'أعطني نكتة', 'كم عمرك', 'كيف حالك اليوم'],
    unknown: ['ما هو عدد سكان بيرو', 'متى انتهت الحرب', 'كيف أصلح دراجة', 'ما هي عاصمة فرنسا', 'كم عدد سكان اليابان'],
  },
  es: {
    greeting: ['hola', 'buenos dias', 'hola agente', 'buenas tardes', 'hey agente'],
    capabilities: ['que puedes hacer', 'como funcionas', 'quien eres', 'para que sirves', 'cual es tu trabajo'],
    privacy: ['envias mis datos', 'necesitas una clave', 'funciona sin internet', 'mis datos estan seguros', 'subes mi codigo'],
    code: ['que hace Agent.tsx', 'donde esta el planificador', 'cuantas recetas hay', 'cuantos archivos hay', 'que es el modelo'],
    edit: ['anade un contador de racha', 'cambia el texto', 'borra un ajuste', 'crea un tema nuevo', 'reescribe el texto'],
    thanks: ['gracias', 'muchas gracias', 'te lo agradezco', 'mil gracias', 'muy amable'],
    smalltalk: ['como estas', 'dame un chiste', 'cual es tu nombre', 'cuantos años tienes', 'que tal tu dia'],
    unknown: ['cual es la capital de francia', 'cuando termino la guerra', 'como arreglo una bicicleta', 'cuando fue la segunda guerra mundial', 'cuantos habitantes tiene peru'],
  },
  fr: {
    greeting: ['bonjour', 'salut', 'bonsoir', 'coucou', 'bonjour agent'],
    capabilities: ['que sais tu faire', 'comment fonctionnes tu', 'qui es tu', 'a quoi tu sers', 'quel est ton travail'],
    privacy: ['envoies tu mes donnees', 'as tu besoin d une cle', 'ca marche sans internet', 'mes donnees sont en securite', 'televerses tu mon code'],
    code: ['que fait Agent.tsx', 'ou est le planificateur', 'combien de recettes', 'combien de fichiers', 'quest ce que le modele'],
    edit: ['ajoute un compteur', 'change le texte', 'supprime un reglage', 'cree un nouveau theme', 'reecris le texte'],
    thanks: ['merci', 'merci beaucoup', 'je te remercie', 'merci beaucoup', 'tres gentil'],
    smalltalk: ['comment vas tu', 'raconte une blague', 'quel est ton nom', 'quel age as tu', 'comment s est passe ta journee'],
    unknown: ['quelle est la capitale de france', 'quand la guerre a t elle fini', 'comment reparer un velo', 'qui a invente l euro', 'quelle est la capitale du japon'],
  },
  de: {
    greeting: ['hallo', 'guten morgen', 'moin', 'guten abend', 'hallo agent'],
    capabilities: ['was kannst du', 'wie funktionierst du', 'wer bist du', 'wofur bist du gut', 'was ist deine aufgabe'],
    privacy: ['sendest du meine daten', 'brauchst du einen schluessel', 'geht das ohne internet', 'sind meine daten sicher', 'laedst du meinen code hoch'],
    code: ['was macht Agent.tsx', 'wo ist der planner', 'wie viele rezepte', 'wie viele dateien', 'was ist das modell'],
    edit: ['fuege einen zaehler hinzu', 'aendere den text', 'loesche eine einstellung', 'erstelle ein neues thema', 'schreibe den text neu'],
    thanks: ['danke', 'vielen dank', 'das ist nett', 'herzlichen dank', 'das ist sehr nett'],
    smalltalk: ['wie geht es dir', 'erzaehle einen witz', 'wie heisst du', 'wie alt bist du', 'wie war dein tag'],
    unknown: ['wie repariere ich ein fahrrad', 'wann endete der krieg', 'wie hoch ist der everest', 'wer hat den euro erfunden', 'wie viele einwohner hat peru'],
  },
  pt: {
    greeting: ['ola', 'bom dia', 'ola agente', 'boa noite', 'e ai'],
    capabilities: ['o que podes fazer', 'como funciona isto', 'quem e tu', 'para que serve', 'qual e o teu trabalho'],
    privacy: ['envias os meus dados', 'precisas de uma chave', 'funciona sem internet', 'os meus dados estao seguros', 'envias o meu codigo'],
    code: ['o que faz o Agent.tsx', 'onde esta o planeador', 'quantas receitas existem', 'quantos ficheiros existem', 'o que e o modelo', 'o que faz o ficheiro src/Agent.tsx', 'o que ha no ficheiro src/i18n.ts'],
    edit: ['adiciona um contador', 'muda o texto', 'remove um ajuste', 'cria um tema novo', 'reescreve o texto'],
    thanks: ['obrigado', 'muito obrigado', 'agradeço', 'valeu', 'obrigado mesmo'],
    smalltalk: ['como estas', 'conta uma piada', 'qual e o teu nome', 'quantos anos tens', 'como foi o teu dia'],
    unknown: ['qual e a capital de franca', 'quando acabou a guerra', 'como arrumo uma bicicleta', 'quantos habitantes tem o peru', 'quem inventou o euro'],
  },
  it: {
    greeting: ['ciao', 'buongiorno', 'buona sera', 'ehi', 'ciao agente'],
    capabilities: ['cosa sai fare', 'come funzioni', 'chi sei', 'a cosa serve', 'qual e il tuo lavoro'],
    privacy: ['mandi i miei dati', 'serve una chiave', 'funziona senza internet', 'i miei dati sono al sicuro', 'carichi il mio codice'],
    code: ['cosa fa Agent.tsx', 'dove e il pianificatore', 'quante ricette ci sono', 'quanti file ci sono', 'cos e il modello'],
    edit: ['aggiungi un contatore', 'cambia il testo', 'rimuovi un impostazione', 'crea un nuovo tema', 'riscrivi il testo'],
    thanks: ['grazie', 'grazie mille', 'ti ringrazio', 'molto gentile', 'grazie davvero'],
    smalltalk: ['come stai', 'raccontami una barzelletta', 'qual e il tuo nome', 'quanti anni hai', 'come e andata la giornata'],
    unknown: ['qual e la capitale di francia', 'quando e finita la guerra', 'come aggiusto una bicicletta', 'chi ha inventato l euro', 'quanti abitanti ha il peru'],
  },
  nl: {
    greeting: ['hallo', 'hoi', 'goedendag', 'goedenavond', 'hoi agent'],
    capabilities: ['wat kan jij', 'hoe werkt het', 'wie ben jij', 'waarvoor ben je goed', 'wat is je taak'],
    privacy: ['stuur je mijn gegevens', 'heb je een sleutel nodig', 'werkt het zonder internet', 'zijn mijn gegevens veilig', 'upload je mijn code'],
    code: ['wat doet Agent.tsx', 'waar is de planner', 'hoeveel recepten zijn er', 'hoeveel bestanden zijn er', 'wat is het model'],
    edit: ['voeg een teller toe', 'wijzig de tekst', 'verwijder een instelling', 'maak een nieuw thema', 'schrijf de tekst opnieuw'],
    thanks: ['dank je', 'bedankt', 'hartelijk dank', 'erg prettig', 'heel erg bedankt'],
    smalltalk: ['hoe gaat het', 'vertel een grap', 'hoe heet je', 'hoe oud ben je', 'hoe was je dag'],
    unknown: ['hoe lang is de mount everest', 'wanneer eindigde de oorlog', 'hoe repareer ik een fiets', 'wie heeft de euro bedacht', 'hoeveel inwoners heeft peru'],
  },
  ru: {
    greeting: ['привет', 'здравствуйте', 'доброе утро', 'добрый вечер', 'привет агент'],
    capabilities: ['что ты умеешь', 'как ты работаешь', 'кто ты', 'зачем ты нужен', 'какая твоя задача'],
    privacy: ['ты отправляешь мои данные', 'нужен ли ключ', 'работает ли без интернета', 'мои данные в безопасности', 'загружаешь ли мой код'],
    code: ['что делает Agent.tsx', 'где планировщик', 'сколько рецептов', 'сколько файлов', 'что за модель'],
    edit: ['добавь счетчик', 'измени текст', 'удали настройку', 'создай новую тему', 'перепиши текст'],
    thanks: ['спасибо', 'большое спасибо', 'благодарю', 'очень благодарю', 'очень любезно'],
    smalltalk: ['как дела', 'расскажи анекдот', 'как тебя зовут', 'сколько тебе лет', 'как прошел день'],
    unknown: ['как починить велосипед', 'когда закончилась война', 'какова высота эвереста', 'кто изобрел евро', 'сколько жителей в перу',
      // A question that is well formed and simply out of scope, which is the case that
      // matters: the five above are all nonsense strings, so the class had never been taught
      // that a *sensible* question can still be unanswerable, and this one was answered with
      // a confident description of what the chat can do. Deliberately the only one that opens
      // with a question word and no build noun in it, so it can only reach unknown by way of
      // the capital of Peru being words nothing in the table has ever seen.
      'какая столица перу'],
  },
  tr: {
    greeting: ['merhaba', 'selam', 'günaydın', 'iyi aksamlar', 'merhaba ajan'],
    capabilities: ['ne yapabilirsin', 'nasıl çalışıyorsun', 'kimsin', 'ne için varsın', 'görevin ne'],
    privacy: ['verilerimi gönderiyor musun', 'anahtar gerekiyor mu', 'internetsiz çalışıyor mu', 'verilerim güvende mi', 'kodumu yüklüyor musun'],
    code: ['Agent.tsx ne yapıyor', 'planlayıcı nerede', 'kaç tarif var', 'kaç dosya var', 'model ne'],
    edit: ['bir sayaç ekle', 'metni değiştir', 'bir ayarı sil', 'yeni bir tema oluştur', 'metni yeniden yaz'],
    thanks: ['teşekkürler', 'sağ ol', 'çok teşekkür ederim', 'sağ ol gerçekten', 'çok naziksin'],
    smalltalk: ['nasılsın', 'bir fıkra anlat', 'adın ne', 'kaç yaşındasın', 'günün nasıl geçti'],
    unknown: ['bisikleti nasıl tamir ederim', 'savaş ne zaman bitti', 'everest ne kadar yüksek', 'euroyu kim icat etti', 'perunun nüfusu kaç'],
  },
  hi: {
    greeting: ['नमस्ते', 'नमस्कार', 'सुप्रभा', 'शुभ प्रभात', 'नमस्ते एजेंट'],
    capabilities: ['तुम क्या कर सकते हो', 'तुम कैसे काम करते हो', 'तुम कौन हो', 'तुम्हारा क्या काम है', 'तुम्हारा काम क्या है'],
    privacy: ['क्या तुम मेरा डेटा भेजते हो', 'क्या तुम्हें इंटरनेट चाहिए', 'क्या यह निजी है', 'क्या मेरा डेटा सुरक्षित है', 'क्या तुम कोड भेजते हो'],
    code: ['Agent.tsx क्या करता है', 'प्लानर कहाँ है', 'कितनी रेसिपी हैं', 'कितनी फाइलें हैं', 'मॉडल क्या है'],
    edit: ['एक काउंटर जोड़ो', 'टेक्स्ट बदलो', 'एक सेटिंग हटाओ', 'एक नया थीम बनाओ', 'टेक्स्ट दोबारा लिखो'],
    thanks: ['धन्यवाद', 'शुक्रिया', 'बहुत बहुत धन्यवाद', 'बहुत धन्यवाद', 'आप बहुत दयालु हैं'],
    smalltalk: ['तुम कैसे हो', 'एक चुटकुला सुनाओ', 'तुम्हारा नाम क्या है', 'तुम्हारी उम्र क्या है', 'आज का दिन कैसा रहा'],
    unknown: ['साइकिल कैसे ठीक करें', 'युद्ध कब खत्म हुआ', 'एवरेस्ट कितनी ऊँची है', 'यूरो किसने बनाया', 'पेरू में कितने लोग रहते हैं'],
  },
  ja: {
    greeting: ['こんにちは', 'おはようございます', 'こんばんは', 'こんばんは', 'こんにちはエージェント'],
    capabilities: ['何ができますか', 'どのように動きますか', 'あなたは誰ですか', 'あなたは何の助手ですか', 'あなたの役割は何ですか'],
    privacy: ['私のデータを送りますか', 'インターネットが必要ですか', 'データは安全ですか', '私のコードを送りますか', '外部に送信されますか'],
    code: ['Agent.tsxは何をしていますか', 'プランナーはどこですか', 'レシピはいくつですか', 'ファイルはいくつありますか', 'モデルは何ですか'],
    edit: ['カウンターを追加して', '文言を変更して', '設定を削除して', '新しいテーマを作って', '文言を書き換えて'],
    thanks: ['ありがとう', 'ありがとうございます', '感謝します', 'どうもありがとうございます', 'とても助かりました'],
    smalltalk: ['元気ですか', '冗談を言って', '名前はなんですか', 'お歳はいくつですか', '今日はどうでしたか'],
    unknown: ['自転車の直し方を教えて', '戦争はいつ終わったの', 'エベレストの高さは', '日本の首都はどこですか', '囲碁のルールを教えて'],
  },
  ko: {
    greeting: ['안녕하세요', '안녕', '반갑습니다', '좋은 아침', '안녕히 계세요'],
    capabilities: ['무엇을 할 수 있어요', '어떻게 동작해요', '당신은 누구예요', '무엇을 도와줄 수 있어요', '무슨 일을 해요'],
    privacy: ['제 데이터를 보내요', '인터넷이 필요해요', '비밀키가 필요해요', '제 데이터가 안전해요', '제 코드를 보내요'],
    code: ['Agent.tsx는 무엇을 해요', '플래너는 어디 있어요', '레시피가 몇 개예요', '파일이 몇 개예요', '모델이 뭐예요'],
    edit: ['카운터를 추가해줘', '문구를 바꿔줘', '설정을 삭제해줘', '새 테마를 만들어줘', '문구를 다시 써줘'],
    thanks: ['고마워요', '감사합니다', '정말 고마워요', '늘 고마워요', '정말 도움이 됐어요'],
    smalltalk: ['어떻게 지내요', '농담을 해줘', '이름이 뭐예요', '몇 살이에요', '오늘 기분이 어때요'],
    unknown: ['자전거를 어떻게 고쳐요', '전쟁은 언제 끝났어요', '에베레스트는 얼마나 높아요', '유로는 누가 만들었어요', '한국의 인구는 몇 명이에요'],
  },
  zh: {
    greeting: ['你好', '您好', '早上好', '晚上好', '嗨'],
    capabilities: ['你能做什么', '你是怎么工作的', '你是谁', '你有什么用', '你的任务是什么'],
    privacy: ['你会发送我的数据吗', '需要联网吗', '需要密钥吗', '我的数据安全吗', '会上传我的代码吗'],
    code: ['Agent.tsx做什么', '规划器在哪里', '有多少个配方', '有多少个文件', '模型是什么'],
    edit: ['添加一个计数器', '修改这段文字', '删除一个设置', '创建一个新主题', '重写这段文字'],
    thanks: ['谢谢', '非常感谢', '多谢了', '太感谢了', '真的很有帮助'],
    smalltalk: ['你好吗', '讲个笑话', '你叫什么名字', '你多大了', '今天过得怎么样'],
    unknown: ['自行车怎么修', '战争什么时候结束', '珠穆朗玛峰有多高', '围棋的规则是什么', '唐朝是什么时候',
      // The five above carry no question word at all, so the class had only ever been shown
      // messages that look like nonsense and was never shown a well formed question it
      // simply cannot answer: this one was answered with a confident statement about the
      // chat's own privacy. 哪里 is also the word the code templates use for "where", so
      // the only thing telling the two apart is that 秘鲁首都 is not a build noun - which
      // is the same distinction the Japanese 日本の首都どこですか line draws.
      '秘鲁的首都是哪里'],
  },
  id: {
    greeting: ['halo', 'hai', 'selamat pagi', 'selamat malam', 'halo agen'],
    capabilities: ['apa yang bisa kamu lakukan', 'bagaimana cara kerjanya', 'siapa kamu', 'untuk apa kamu', 'apa tugasmu'],
    privacy: ['apakah kamu mengirim data saya', 'apakah perlu internet', 'apakah perlu kunci', 'data saya aman', 'apakah kamu mengunggah kode saya'],
    code: ['apa yang dilakukan Agent.tsx', 'di mana perencanaannya', 'berapa banyak resep', 'ada berapa berkas', 'apa itu model'],
    edit: ['tambahkan penghitung', 'ubah teksnya', 'hapus sebuah pengaturan', 'buat tema baru', 'tulis ulang teksnya'],
    thanks: ['terima kasih', 'makasih banyak', 'saya berterima kasih', 'terima kasih banyak', 'sangat membantu'],
    smalltalk: ['apa kabar', 'tolong ceritakan lelucon', 'siapa namamu', 'berapa umur kamu', 'bagaimana harimu'],
    unknown: ['bagaimana cara memperbaiki sepeda', 'kapan perang berakhir', 'berapa tinggi everest', 'siapa yang menemukan euro', 'berapa penduduk peru'],
  },
  ur: {
    greeting: ['سلام', 'ہیلو', 'صبح بخیر', 'شب بخیر', 'سلام ایجنٹ'],
    capabilities: ['تم کیا کر سکتے ہو', 'تم کیسے کام کرتے ہو', 'تم کون ہو', 'یہ کس کام کے لیے ہے', 'تمہارا کام کیا ہے'],
    privacy: ['کیا تم میرا ڈیٹا بھیجتے ہو', 'کیا انٹرنیٹ چاہیے', 'کیا کلید چاہیے', 'کیا میرا ڈیٹا محفوظ ہے', 'کیا تم میرا کوڈ بھیجتے ہو'],
    code: ['Agent.tsx کیا کرتا ہے', 'پلانر کہاں ہے', 'کتنے ریسپی ہیں', 'کتنے فائل ہیں', 'ماڈل کیا ہے'],
    edit: ['ایک کاؤنٹر شامل کریں', 'متن تبدیل کریں', 'ایک سیٹنگ حذف کریں', 'ایک نیا تھیم بنائیں', 'متن دوبارہ لکھیں'],
    thanks: ['شکریہ', 'بہت شکریہ', 'آپ کا شکریہ', 'بہت بہت شکریہ', 'آپ بہت مہربان ہیں'],
    smalltalk: ['آپ کیسے ہیں', 'ایک لطیفہ سنائیں', 'آپ کا نام کیا ہے', 'آپ کی عمر کیا ہے', 'آج کا دن کیسا رہا'],
    unknown: ['سائیکل کیسے ٹھیک کریں', 'جنگ کب ختم ہوئی', 'ایورسٹ کتنی بلند ہے', 'یورو کس نے ایجار کیا', 'پاکستان میں کتنے لوگ رہتے ہیں'],
  },
};

/**
 * Unrelated words mixed into a sentence, so the classifier cannot key on length or on a
 * clean prefix. This is the cheapest way to stop it learning "starts with hi" rather than
 * "is a greeting".
 *
 * Per language, because English noise dropped into a Japanese sentence teaches the
 * classifier that English is part of every language and nothing else. A locale with no
 * list gets none, which costs that locale the noise-augmented rows and is still better
 * than rows carrying a foreign language's function words.
 */
const NOISE = {
  en: ['please', 'ok', 'so', 'right', 'now', 'today', 'quickly', 'a bit',
    'actually', 'honestly', 'by the way', 'well', 'hmm', 'also', 'just', 'really'],
  ar: ['من فضلك', 'حسنا', 'الآن', 'أيضا'],
  es: ['por favor', 'vale', 'ahora', 'tambien'],
  fr: ['sil te plait', 'bon', 'maintenant', 'aussi'],
  de: ['bitte', 'gut', 'jetzt', 'auch'],
  pt: ['por favor', 'ok', 'agora', 'tambem'],
  it: ['per favore', 'ok', 'adesso', 'anche'],
  nl: ['alsjeblieft', 'ok', 'nu', 'ook'],
  ru: ['пожалуйста', 'хорошо', 'сейчас', 'также'],
  tr: ['lutfen', 'tamam', 'simdi', 'ayrica'],
  hi: ['कृपया', 'ठीक है', 'अभी', 'भी'],
  ja: ['よろしく', 'はい', '今', 'も'],
  ko: ['제발', '네', '지금', '도'],
  zh: ['请', '好的', '现在', '也'],
  id: ['tolong', 'oke', 'sekarang', 'juga'],
  ur: ['براہ کرم', 'ٹھیک', 'اب', 'بھی'],
};

/** The files the planner watches, used to vary the context block honestly. */
const FILES = ['src/Agent.tsx', 'src/i18n.ts', 'src/App.tsx', 'src/styles.css', 'src/state.tsx'];

/**
 * How many rows each sentence is emitted as.
 *
 * Uniform across all sixteen locales, deliberately. The first version gave English five and
 * everything else three, on the reasoning that English has the most templates - which is
 * true, and which made the per-language gate measure the corpus rather than the classifier:
 * English was scored on 123 held-out rows and Urdu on 8, so a single unlucky row moved Urdu
 * by twelve points and English by less than one. Uniform repetition, plus a second and third
 * phrasing per intent in every locale, is what makes the worst-language number mean
 * something.
 */
const REPS = 5;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build() {
  const rand = mulberry(0xc4a7);
  const data = [];

  // Every locale, English included, through one path: a list of sentences per intent, a
  // list of noise words, and a context block that sometimes contradicts the words.
  const corpora = [{lang: 'en', intents: TEMPLATES}, ...Object.entries(LOCALES).map(([lang, intents]) => ({lang, intents}))];

  for (const {lang, intents} of corpora) {
    const noise = NOISE[lang] || [];
    const reps = REPS;
    for (let c = 0; c < INTENTS.length; c++) {
      const name = INTENTS[c];
      for (const base of intents[name]) {
        // Each template is emitted several times with different context and different noise,
        // so every class is seen both with and without files in hand and with the context
        // block contradicting the words.
        for (let rep = 0; rep < reps; rep++) {
          let text = base;
          if (noise.length && rand() < 0.3) {
            // One noise word, not one or two. Two made "bon comment s est passe ta
            // journee sil te plait" into a row the network had to fit on filler count alone,
            // and the counts collided across templates: that same vector was filed under
            // unknown three times in training, by a different template, so the class it
            // learned was whichever label the wider collision won. The point of the noise
            // is to teach that one filler word in front of a sentence changes nothing, and
            // a second word stops testing that and starts testing sentence length.
            const pick = noise[Math.floor(rand() * noise.length)];
            text = rand() < 0.5 ? `${pick} ${text}` : `${text} ${pick}`;
          }
          const withFiles = rand() < 0.6;
          const ctx = {
            files: withFiles ? FILES.slice(0, 1 + Math.floor(rand() * FILES.length)) : [],
            canWrite: rand() < 0.5,
            isOwner: rand() < 0.7,
          };
          data.push({x: features(text, ctx), want: c, text, lang, rep});
        }
      }
    }
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// A diagnostic mode, because the corpus and the word table have to agree
// ─────────────────────────────────────────────────────────────────────────────
//
//   npm run train:chat -- --roles
//
// The role table in src/ai/chat-router.ts is hand-written in sixteen languages and the
// corpus below is hand-written in sixteen languages, and nothing but a human reading both
// connects them. The failure this catches is a word in a template that is not in the table
// at all - a conjugated form, a case ending, a spelling with an accent the table does not
// carry - which is invisible in the corpus and shows up only as a locale that routes at
// chance while its neighbours are fine.
//
// It also catches the two rows that light up exactly the same roles under two different
// labels, which is the one thing no amount of training fixes: the classifier is being asked
// to separate two sentences that are, to it, the same sentence.
if (process.argv.includes('--roles')) {
  const ctx = {files: FILES, canWrite: true, isOwner: true};
  const ROLE_COUNT_N = ROLES.length;
  const OOV_AT = ROLE_COUNT_N * 2 + 3;
  const FILEISH_AT = ROLE_COUNT_N * 2 + 2;
  const inspect = (text) => {
    const x = features(text, ctx);
    const roles = [];
    for (let r = 0; r < ROLE_COUNT_N; r++) if (x[r] > 0) roles.push(ROLES[r]);
    return {roles, oov: x[OOV_AT], fileish: x[FILEISH_AT]};
  };

  const corpora = [{lang: 'en', intents: TEMPLATES}, ...Object.entries(LOCALES).map(([lang, intents]) => ({lang, intents}))];
  let dead = 0;
  let clashes = 0;
  for (const {lang, intents} of corpora) {
    const bySignature = new Map();
    const lines = [];
    for (const name of INTENTS) {
      for (const text of intents[name] || []) {
        const {roles, oov, fileish} = inspect(text);
        // A row for 'unknown' that lights up no role is the point of the class, not a
        // defect: gibberish and an unfamiliar topic are supposed to arrive as nothing the
        // table recognises, and the coverage feature is what routes them. Only a row in
        // some other intent that matches nothing is a hole in the table.
        if (!roles.length && !fileish) {
          if (name !== 'unknown') {
            dead++;
            lines.push(`    DEAD      ${name.padEnd(13)} ${text}`);
          }
          continue;
        }
        // The signature has to include the coverage and file features, because those are
        // now what separate the rows that share every role. Two rows that differ only in
        // how much of the sentence the table recognises are not a clash; two rows identical
        // in both are a pair no amount of training can pull apart.
        const sig = `${roles.join('+')}|${Math.round(oov * 20)}|${fileish}`;
        const seen = bySignature.get(sig);
        if (seen && seen.name !== name) {
          clashes++;
          lines.push(`    CLASH     ${name.padEnd(13)} ${text}`);
          lines.push(`             same roles, coverage and file signal as ${seen.name}: "${seen.text}"`);
          continue;
        }
        if (!seen) bySignature.set(sig, {name, text});
      }
    }
    if (lines.length) {
      console.log(`\n${lang}:`);
      for (const l of lines) console.log(l);
    }
  }
  console.log(`\n${dead} template(s) activate no role, ${clashes} clash(es).`);
  process.exit(dead + clashes ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Training: cross-entropy over the eight intents
// ─────────────────────────────────────────────────────────────────────────────

const moment = (n) => ({m: new Float64Array(n), v: new Float64Array(n), t: 0});

function adamStep(p, g, a, lr) {
  a.t++;
  const c1 = 1 - Math.pow(0.9, a.t);
  const c2 = 1 - Math.pow(0.999, a.t);
  for (let i = 0; i < p.length; i++) {
    a.m[i] = 0.9 * a.m[i] + 0.1 * g[i];
    a.v[i] = 0.999 * a.v[i] + 0.001 * g[i] * g[i];
    p[i] -= (lr * (a.m[i] / c1)) / (Math.sqrt(a.v[i] / c2) + 1e-8);
  }
}

/** Forward pass that keeps every layer's activations, which backpropagation needs. */
function forwardCache(net, x) {
  const acts = [Float64Array.from(x)];
  let buf = acts[0];
  for (const L of net.layers) {
    const z = new Float64Array(L.out);
    for (let o = 0; o < L.out; o++) {
      let s = L.b[o];
      const base = o * L.in;
      for (let i = 0; i < L.in; i++) s += L.w[base + i] * buf[i];
      z[o] = s;
    }
    const a = new Float64Array(L.out);
    // Leaky ReLU, matching forward() in engine.ts exactly. A hard zero here would let a
    // neuron die during training and then be dead at runtime, which is the one way the
    // trainer and the browser can silently disagree about the same weights.
    for (let o = 0; o < L.out; o++) a[o] = z[o] > 0 ? z[o] : z[o] * 0.01;
    acts.push(a);
    buf = a;
  }
  return acts;
}

const OUTS = INTENTS.length;

function train(data) {
  const net = network(CHAT_FEATURE_SIZE, [...HIDDEN, OUTS]);
  const rand = mulberry(0x5eed);
  const scale = Math.sqrt(2 / CHAT_FEATURE_SIZE);
  for (const L of net.layers) for (let i = 0; i < L.w.length; i++) L.w[i] = (rand() * 2 - 1) * scale;
  const state = net.layers.map((L) => ({w: moment(L.w.length), b: moment(L.b.length)}));

  const order = data.map((_, i) => i);
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const lr = LR * (0.5 * (1 + Math.cos((Math.PI * epoch) / EPOCHS)) * 0.9 + 0.1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let loss = 0;
    for (let start = 0; start < order.length; start += BATCH) {
      const idx = order.slice(start, start + BATCH);
      const n = idx.length;
      const gw = net.layers.map((L) => new Float64Array(L.w.length));
      const gb = net.layers.map((L) => new Float64Array(L.b.length));
      for (const k of idx) {
        const e = data[k];
        const acts = forwardCache(net, e.x);
        const p = softmax(acts[acts.length - 1]);
        loss += -Math.log(Math.max(1e-9, p[e.want]));
        // dL/dlogit = p - onehot
        let dz = new Float64Array(OUTS);
        for (let o = 0; o < OUTS; o++) dz[o] = (p[o] - (o === e.want ? 1 : 0)) / n;
        for (let li = net.layers.length - 1; li >= 0; li--) {
          const L = net.layers[li];
          const aPrev = acts[li];
          for (let o = 0; o < L.out; o++) {
            const g = dz[o];
            if (g === 0) continue;
            const base = o * L.in;
            for (let i = 0; i < L.in; i++) gw[li][base + i] += g * aPrev[i];
            gb[li][o] += g;
          }
          if (li > 0) {
            const dA = new Float64Array(L.in);
            for (let o = 0; o < L.out; o++) {
              const g = dz[o];
              if (g === 0) continue;
              const base = o * L.in;
              for (let i = 0; i < L.in; i++) dA[i] += g * L.w[base + i];
            }
            const dzP = new Float64Array(L.in);
            for (let i = 0; i < L.in; i++) dzP[i] = dA[i] * (acts[li][i] > 0 ? 1 : 0.01);
            dz = dzP;
          }
        }
      }
      for (let li = 0; li < net.layers.length; li++) {
        adamStep(net.layers[li].w, gw[li], state[li].w, lr);
        adamStep(net.layers[li].b, gb[li], state[li].b, lr);
      }
    }
    if (epoch % 150 === 0 || epoch === EPOCHS - 1) {
      const acc = accuracy(net, data);
      console.log(`  epoch ${String(epoch).padStart(3)}  loss ${(loss / data.length).toFixed(4)}  train acc ${(acc * 100).toFixed(1)}%`);
    }
  }
  return net;
}

function accuracy(net, data) {
  let ok = 0;
  for (const e of data) {
    const p = softmax(forwardAll(net, e.x));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === e.want) ok++;
  }
  return ok / data.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v) => {
  const s = v.toPrecision(7);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};

const matrix = (L) => {
  const rows = [];
  for (let o = 0; o < L.out; o++) {
    const row = [];
    for (let i = 0; i < L.in; i++) row.push(fmt(L.w[o * L.in + i]));
    rows.push(row.join(','));
  }
  return rows.join(',');
};

console.log(`vocabulary: ${CHAT_FEATURE_SIZE} features, outputs: ${OUTS} (${INTENTS.join(', ')})`);
const all = build();

/**
 * The held-out split, by repetition rather than at random.
 *
 * A training-set accuracy on a generated corpus mostly measures how many templates there
 * are. The held-out rows use templates the classifier has still seen - there are no unseen
 * phrasings to hold out when the corpus is generated - but they are rows it was not fitted
 * on, and they carry the noise and context it has to generalise past, so the gap between
 * the two numbers is the honest part.
 *
 * By repetition, and not by shuffling, and that is the whole point. Every sentence is
 * emitted REPS times with different noise and different context, and which of those copies
 * is held out used to be drawn from the same random stream that generates the noise. So
 * editing a single word in one table re-rolled which copies of every other sentence were
 * being tested, and the accuracy moved by three points without the router or the corpus
 * having changed in any way that mattered. Two runs were compared, a four-word table change
 * "cost" 2.5 points, a wider network was blamed for it, and the whole sequence was
 * measuring the shuffle.
 *
 * Holding out the last repetition instead makes the number mean the same thing on every
 * run: each template is fitted on four noisy versions and tested on a fifth, which is the
 * generalisation that actually matters - a phrasing the reader types that is not the
 * phrasing the table was written from.
 */
const HELD_FROM = REPS - 1;
const originalTrain = all.filter((d) => d.rep < HELD_FROM);
const heldOut = all.filter((d) => d.rep >= HELD_FROM);

/**
 * Rows written by a language model, used for training and never for the number above.
 *
 * The template tables are the constraint, not the goal. They can only contain phrasings
 * somebody thought to write down, and across sixteen languages that is a few hundred
 * sentences per intent - thin exactly where it matters, since the languages with the
 * smallest tables are the ones the classifier was worst at. A local model asked for
 * ordinary player sentences produces sentences nobody had to think of, and the gap it
 * closes is in vocabulary rather than in network size.
 *
 * Two things this deliberately does not do.
 *
 * It does not touch the held-out split. The 813 rows above stay exactly as they are, so
 * the 97.2% they produce remains comparable to every run before it. The teacher's own
 * held-out rows are scored separately, further down, as the second number: the same eight
 * intents in the same sixteen languages, but phrasings that exist in no table here, which
 * is the only way to tell that the router generalises rather than that it has memorised a
 * longer list.
 *
 * And it does not consume the random stream that build() used. That stream decides the
 * noise and the context on every row, and the noise draw is the first value taken from it,
 * so appending even one extra call ahead of build() would re-roll which repetitions of
 * every template are held out. The comment above build()'s split explains what that cost
 * when it was mistaken for a modelling change: a four-word edit to a table appeared to
 * move held-out accuracy by two and a half points, a wider network got blamed for it, and
 * the whole comparison was measuring the shuffle. The teacher rows get their own seed.
 */
const TEACHER_FILE = join(HERE, '..', 'src', 'ai', 'chat-teacher-data.json');
// Off unless asked for, and the default matters more than it looks. With the teacher's
// rows in the training set this script reproduces 92-93% on the held-out split instead of
// 97.2%, and the reason is not label noise: the eight intents are defined by what the
// reply library in src/ai/chat.ts can answer, and a language model asked to invent player
// sentences draws those boundaries somewhere else. Feeding the rows in trains the network
// on a slightly different task, which is worse than the smaller corpus, not better.
// The corpus is still worth having - scripts/mine-vocab.mjs reads it to widen the word
// tables, which is the one thing about it that does generalise.
const TEACHER_REPEATS = Number(process.env.TEACHER_REPEATS ?? 0);

/** Map one generated sentence onto a training row, with its own context and noise. */
function teacherRow(row, rand, rep) {
  const noise = NOISE[row.lang] || [];
  let text = row.text;
  if (noise.length && rand() < 0.3) {
    const pick = noise[Math.floor(rand() * noise.length)];
    text = rand() < 0.5 ? `${pick} ${text}` : `${text} ${pick}`;
  }
  const withFiles = rand() < 0.6;
  const ctx = {
    files: withFiles ? FILES.slice(0, 1 + Math.floor(rand() * FILES.length)) : [],
    canWrite: rand() < 0.5,
    isOwner: rand() < 0.7,
  };
  return {x: features(text, ctx), want: INTENTS.indexOf(row.intent), text, lang: row.lang, rep, teacher: true};
}

const teacher = {train: [], held: [], unknownIntent: [], unknownLang: []};
if (existsSync(TEACHER_FILE)) {
  const raw = JSON.parse(readFileSync(TEACHER_FILE, 'utf8'));
  const known = new Set(['en', ...Object.keys(LOCALES)]);
  const take = (rows, repeats) => {
    const rand = mulberry(0x7ea4c1a9);
    const out = [];
    for (const row of rows ?? []) {
      if (!INTENTS.includes(row.intent)) {
        // Loudly, not silently. An early version of the generator labelled its hard cells
        // 'howto-vs-smalltalk' and would have written those rows straight into the corpus,
        // where INTENTS.indexOf returns -1 and they train the network to output a class
        // that does not exist.
        teacher.unknownIntent.push(`${row.lang} ${row.intent} ${row.text.slice(0, 40)}`);
        continue;
      }
      if (!known.has(row.lang)) {
        teacher.unknownLang.push(`${row.lang} ${row.intent}`);
        continue;
      }
      for (let rep = 0; rep < repeats; rep++) out.push(teacherRow(row, rand, rep));
    }
    return out;
  };
  teacher.train = take(raw.train, TEACHER_REPEATS);
  teacher.held = take(raw.held, 1);
}

const trainSet = [...originalTrain, ...teacher.train];
console.log(`corpus: ${all.length} rows (${originalTrain.length} train, ${heldOut.length} held out)`);
console.log(`teacher: ${teacher.train.length} train rows, ${teacher.held.length} held out, repeated ${TEACHER_REPEATS}x`);
if (teacher.unknownIntent.length) {
  console.log(`\n  !! ${teacher.unknownIntent.length} teacher row(s) carry an intent that is not one of the eight:`);
  for (const u of teacher.unknownIntent.slice(0, 8)) console.log(`     ${u}`);
  console.log('     these were dropped; regenerate the corpus if this is not empty');
}
if (teacher.unknownLang.length) console.log(`\n  !! dropped ${teacher.unknownLang.length} teacher row(s) in unknown languages`);
console.log('');


const net = train(trainSet);

// Per-class report. 'unknown' is reported first and gated hardest, because a chat that
// never admits it does not know is the one failure worth spending the run on: it answers
// a question nobody asked with a confident sentence.
const perClass = (rows) => {
  const out = [];
  for (let c = 0; c < OUTS; c++) {
    const sub = rows.filter((d) => d.want === c);
    if (!sub.length) continue;
    let ok = 0;
    for (const d of sub) {
      const p = softmax(forwardAll(net, d.x));
      let best = 0;
      for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
      if (best === c) ok++;
    }
    out.push({label: INTENTS[c], acc: ok / sub.length, n: sub.length});
  }
  return out;
};

const report = perClass(trainSet);
const held = perClass(heldOut);
console.log('\nper class (train | held out):');
for (const r of report) {
  const h = held.find((x) => x.label === r.label);
  const bar = '#'.repeat(Math.round(r.acc * 24)).padEnd(24, '.');
  const hbar = '#'.repeat(Math.round((h?.acc ?? 0) * 24)).padEnd(24, '.');
  console.log(`  ${r.label.padEnd(13)} ${bar} ${(r.acc * 100).toFixed(1).padStart(5)}%  ${hbar} ${((h?.acc ?? 0) * 100).toFixed(1).padStart(5)}%  (${r.n} rows)`);
}

const heldAll = accuracy(net, heldOut);
console.log(`\noverall held-out accuracy: ${(heldAll * 100).toFixed(1)}%`);

/**
 * Per language, which is the number that matters here.
 *
 * An average over sixteen languages is exactly the wrong summary: it can be dragged up by
 * English, which has four times the templates of any other locale, while a reader typing
 * in a language that is being routed at chance is not compensated for by a reader typing
 * in English. So this is reported per language, and the gate is on the worst one rather
 * than on the mean.
 */
const langs = [...new Set(heldOut.map((d) => d.lang))];
const perLang = langs.map((lang) => {
  const sub = heldOut.filter((d) => d.lang === lang);
  let ok = 0;
  for (const d of sub) {
    const p = softmax(forwardAll(net, d.x));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === d.want) ok++;
  }
  return {lang, acc: ok / sub.length, n: sub.length};
});
perLang.sort((a, b) => a.acc - b.acc);
console.log('\nheld-out accuracy by language (worst first):');
for (const r of perLang) {
  const bar = '#'.repeat(Math.round(r.acc * 24)).padEnd(24, '.');
  console.log(`  ${r.lang.padEnd(13)} ${bar} ${(r.acc * 100).toFixed(1).padStart(5)}%  (${r.n} rows)`);
}

/**
 * The second number, and the one that actually answers the question the teacher was
 * downloaded to answer.
 *
 * The 97.2% above is measured on sentences built from the same tables the network was
 * fitted on, so it answers "does it generalise past noise and context" and nothing
 * stronger. These 1,645 rows are the same eight intents in the same sixteen languages
 * written by a model that had never seen a table, so they are phrasings this router has
 * no way of having memorised. If the number here is near the one above, the teacher data
 * genuinely taught the vocabulary. If it is far below, the router learned a longer list
 * and nothing else, and the higher figure above is the one that is flattering itself.
 */
if (teacher.held.length) {
  const tAcc = accuracy(net, teacher.held);
  const tLangs = [...new Set(teacher.held.map((d) => d.lang))];
  const tPerLang = tLangs.map((lang) => {
    const sub = teacher.held.filter((d) => d.lang === lang);
    let ok = 0;
    for (const d of sub) {
      const p = softmax(forwardAll(net, d.x));
      let best = 0;
      for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
      if (best === d.want) ok++;
    }
    return {lang, acc: ok / sub.length, n: sub.length};
  });
  tPerLang.sort((a, b) => a.acc - b.acc);
  const tWorst = tPerLang[0];
  console.log('\nteacher held-out accuracy - unseen phrasings, same eight intents:');
  console.log(`  overall ${(tAcc * 100).toFixed(1)}%  (${teacher.held.length} rows)`);
  console.log(`  worst language ${tWorst.lang} ${(tWorst.acc * 100).toFixed(1)}%`);
  for (const r of tPerLang.slice(0, 6)) {
    const bar = '#'.repeat(Math.round(r.acc * 24)).padEnd(24, '.');
    console.log(`  ${r.lang.padEnd(13)} ${bar} ${(r.acc * 100).toFixed(1).padStart(5)}%  (${r.n} rows)`);
  }
}

/**
 * The held-out rows the classifier gets wrong, grouped by the pair it confused.
 *
 * A gate that fails says a number; this says which sentences. Every failure here is a
 * specific pair of things the reader could plausibly type that the network cannot tell
 * apart, and each one is fixable by naming a word or by admitting the pair is genuinely
 * ambiguous - but only if it is written down. The first run of this script failed on
 * 'smalltalk' at 75.9% with a train accuracy of 93.4%, and the gap itself was the clue:
 * the model had learned the templates it was shown and could not generalise to the rows it
 * had not, which is a different problem from not having enough epochs.
 *
 * Each entry also says whether the sentence is separable at all, by listing the labels the
 * training rows carry for the *identical* feature vector. Two labels there means the corpus
 * is asking the network to draw a line through one point and the fix is in the corpus; one
 * label means the features are fine and the optimiser simply has not settled there, which
 * is a different thing to go and change. Guessing between those two was costing more runs
 * than it saved.
 *
 * The last three features are left out of the comparison. They are whether the reader has
 * files, can write and owns the agent, which are drawn at random per row, so including them
 * meant no two rows ever matched and the report said "none" for every error including
 * sentences that are in the corpus five times over. Whether a *sentence* is separable is a
 * question about the words.
 */
const CONTEXT_AT = CHAT_FEATURE_SIZE - 3;
const vectorKey = (x) => Array.from(x.slice(0, CONTEXT_AT), (v) => Math.round(v * 20)).join(',');
const trainLabels = new Map();
for (const d of trainSet) {
  const k = vectorKey(d.x);
  const seen = trainLabels.get(k);
  if (seen) seen[INTENTS[d.want]] = (seen[INTENTS[d.want]] || 0) + 1;
  else trainLabels.set(k, {[INTENTS[d.want]]: 1});
}

const wrong = [];
for (const d of heldOut) {
  const p = softmax(forwardAll(net, d.x));
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  if (best !== d.want) {
    const rivals = trainLabels.get(vectorKey(d.x)) || {};
    wrong.push({
      want: INTENTS[d.want], got: INTENTS[best], text: d.text, lang: d.lang, p: p[best],
      mixed: Object.keys(rivals).length > 1, rivals,
    });
  }
}
if (wrong.length) {
  const pairs = new Map();
  for (const w of wrong) {
    const k = `${w.want} -> ${w.got}`;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k).push(w);
  }
  const ranked = [...pairs.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`\n${wrong.length} held-out rows wrong, in ${ranked.length} confusion(s):`);
  for (const [k, rows] of ranked) {
    const byLang = [...new Set(rows.map((r) => r.lang))].join(' ');
    const mixed = rows.filter((r) => r.mixed).length;
    console.log(
      `\n  ${k}  (${rows.length} rows, langs: ${byLang}` +
      (mixed ? `, ${mixed} not separable: the same vector carries several labels)` : ')'),
    );
    for (const r of rows.slice(0, 4)) {
      const share = Object.entries(r.rivals).map(([l, n]) => `${l}:${n}`).join(' ');
      console.log(`    [${r.lang}] "${r.text}"  (${(r.p * 100).toFixed(0)}% for ${r.got})  train rows: ${share || 'none'}`);
    }
    if (rows.length > 4) console.log(`    ...and ${rows.length - 4} more`);
  }
}

const unknownAcc = held.find((r) => r.label === 'unknown')?.acc ?? 0;
const worstHeld = held.filter((r) => r.label !== 'unknown').reduce((a, b) => (a.acc < b.acc ? a : b));
const worstLang = perLang[0];
if (unknownAcc < 0.85) {
  console.error(`\n'unknown' is only ${(unknownAcc * 100).toFixed(1)}% on held-out rows: the chat would answer questions it has no answer for.`);
  process.exit(1);
}
if (worstHeld.acc < 0.8) {
  console.error(`\n${worstHeld.label} is only ${(worstHeld.acc * 100).toFixed(1)}% on held-out rows - refusing to write weights.`);
  process.exit(1);
}
if (worstLang.acc < 0.8) {
  console.error(`\n${worstLang.lang} routes at only ${(worstLang.acc * 100).toFixed(1)}% on held-out rows. That is the reader being answered confidently in the wrong sentence, in their own language. Refusing to write weights.`);
  process.exit(1);
}

const params = net.layers.reduce((n, l) => n + l.w.length + l.b.length, 0);
const out = [];
out.push('// Generated by scripts/train-chat.mjs. Do not edit by hand.');
out.push('//');
out.push(`// One network, ${CHAT_FEATURE_SIZE} features in, ${OUTS} outputs out: one per intent, so`);
out.push('// the eight compete rather than eight independent classifiers each firing on the');
out.push('// same words. Feature layout: src/ai/chat-router.ts. Replies: src/ai/chat.ts.');
out.push('//');
out.push(`// It routes. It does not write prose: the reply for each intent is a fixed sentence`);
// eslint-disable-next-line
out.push('// in the reader\'s language, and the project answers are assembled from values read');
out.push('// out of the real code.');
out.push('//');
out.push('// Per-class accuracy (train | held out):');
for (const r of report) {
  const h = held.find((x) => x.label === r.label);
  out.push(`//   ${r.label.padEnd(13)} ${(r.acc * 100).toFixed(1).padStart(5)}%  ${((h?.acc ?? 0) * 100).toFixed(1).padStart(5)}%`);
}
out.push('//');
out.push('// Held-out accuracy by language, worst first. One average over sixteen languages');
out.push('// would hide the only failure that matters here - a reader routed confidently to');
out.push('// the wrong sentence, in their own language.');
out.push('//');
for (const r of [...perLang].reverse()) {
  out.push(`//   ${r.lang.padEnd(13)} ${(r.acc * 100).toFixed(1).padStart(5)}%`);
}
out.push('//');
out.push(`// ${params} parameters, and no request ever leaves the device.`);
out.push('');
out.push("import type {Network} from './engine.ts';");
out.push('');
out.push('export const CHAT_WEIGHTS:Network={');
out.push(`  inputSize:${net.inputSize},`);
out.push('  layers:[');
net.layers.forEach((L) => {
  out.push(`   {in:${L.in},out:${L.out},w:Float64Array.from([${matrix(L)}]),b:Float64Array.from([${Array.from(L.b, fmt).join(',')}])},`);
});
out.push('  ],');
out.push('};');
out.push('');

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`\nwrote src/ai/chat-weights.ts  (${params} parameters)`);
