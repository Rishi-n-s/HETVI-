const lettersData = [
  // -----------------------------------------
  // HINDI SHAYARI / POETRY (25)
  // -----------------------------------------
  {
    language: "Hindi",
    greeting: "MERE SUKOON,",
    content: "Tumhaari aankhon mein jo thehar gaya, woh aasmaan hoon main. Tumhaari dhadkan se jo mil gaya, woh jahaan hoon main. Mirabai ne Krishn ko chaha tha jaise, tumhe ussi shiddat se chahta hoon main.",
    date: "A timeless moment"
  },
  {
    language: "Hindi",
    greeting: "MERI ROOH,",
    content: "Duniya ki is bheed mein, mera ek hi thikana hai. Tere dil ke aangan mein hi, mujhe har pal bitana hai. Kabir kehte hain prem ki dhaai aakhar padh, aur maine tere naam mein woh puri kitaab padh li.",
    date: "Written in the stars"
  },
  {
    language: "Hindi",
    greeting: "MERI JAAN,",
    content: "Agar ibadat ka koi chehra hota, toh woh bilkul tumhare jaisa hota. Meri har dua, meri har mannat, sirf aur sirf tum par aakar ruk jati hai.",
    date: "Forever yours"
  },
  {
    language: "Hindi",
    greeting: "MERE HUMSAFAR,",
    content: "Log kehte hain ishq andha hota hai. Par tumse milne ke baad mujhe samajh aaya ki ishq hi to sabse zyada roshan karta hai, seedha rooh ko.",
    date: "Every heartbeat"
  },
  {
    language: "Hindi",
    greeting: "MERI ZINDAGI,",
    content: "Jaise sookhi zameen ko baarish ki boond milti hai, waise hi mere bhanwre jaise man ko tumhara thikana mil gaya. Tum nahi, toh main kuch nahi.",
    date: "Endless love"
  },
  {
    language: "Hindi",
    greeting: "MERI CHANDNI,",
    content: "Tujhe dekh kar chand bhi sharma gaya hoga, ki zameen par bhi koi itna daagh-rahit aur khoobsurat kaise ho sakta hai.",
    date: "Moonlit nights"
  },
  {
    language: "Hindi",
    greeting: "MERI DUA,",
    content: "Mandir ki ghanti aur azaan ki awaaz mein jo paksheegi hai, mujhe tumhari muskurahat mein wahi pakshgi aur sukoon milta hai.",
    date: "Divine connection"
  },
  {
    language: "Hindi",
    greeting: "MERI MANNAT,",
    content: "Main ret sa bikhra hua tha is duniya mein, tumne aakar mujhe aakar diya, aur zindagi naam ka kalash bhar diya.",
    date: "Always"
  },
  {
    language: "Hindi",
    greeting: "MERA ISHQ,",
    content: "Jism se judi har cheez toh fanaa ho jayegi, par mera ishq us dariya ki tarah hai jo rooh mein mil kar anant samandar ban jayega.",
    date: "Eternal"
  },
  {
    language: "Hindi",
    greeting: "MERE KHWAB,",
    content: "Nigahen jab bhi uthti hain, sirf teri talash karti hain. Yeh dil dhadakta hai zaroor, par dhadkane sirf tera naam hi padhti hain.",
    date: "Sleepless nights"
  },
  {
    language: "Hindi",
    greeting: "MERE RAB,",
    content: "Sajde to bahut kiye maine us khuda ke aage, par sukoon mujhe teri bahon mein aakar mila. Tum mera ishq ho, meri bandagi ho.",
    date: "Blessed"
  },
  {
    language: "Hindi",
    greeting: "MERI HASRAT,",
    content: "Agar qayamat ke din khuda mujhse puchega meri aakhri khwahish, main maang lunga ek aur janam, sirf tere saath jeene ke liye.",
    date: "Until the end"
  },
  {
    language: "Hindi",
    greeting: "MERA SAAYA,",
    content: "Kabir kahte hain dukh mein sumiran sab kare. Par mujhe lagta hai ishq mein sumiran karna hi asli bandagi hai. Tumhara naam hi mera sumiran hai.",
    date: "Devotion"
  },
  {
    language: "Hindi",
    greeting: "MERA PYAAR,",
    content: "Baarish ki bundon mein, hawa ke jhonkon mein, mujhe tumhara aas-paas hona mehsoos hota hai. Tum meri zindagi ki sabse haseen ghazal ho.",
    date: "Poetry in motion"
  },
  {
    language: "Hindi",
    greeting: "MERA WAZOOD,",
    content: "Tera mera rishta us roohani kache dhaage ki tarah hai, jise na waqt tod sakta hai aur na hi qayamat. Hum dono anant hain.",
    date: "Unbreakable bond"
  },
  {
    language: "Hindi",
    greeting: "MERE CHAND,",
    content: "Pyaar ka matlab maine kitabon mein khoja, par iska asal ehsaas tumhari in do gahri aankhon mein utar kar hi samajh aaya.",
    date: "Deepest thoughts"
  },
  {
    language: "Hindi",
    greeting: "MERA SANSAR,",
    content: "Tum wo phool ho jiski khushboo se meri zindagi ki aabaadi hai, tum wo noor ho jisse meri dosti bhari is duniya mein ujala hai.",
    date: "You are my world"
  },
  {
    language: "Hindi",
    greeting: "MERI AAS,",
    content: "Aag ka dariya hai aur doob ke jana hai, aashiqon ki is bhid mein sirf tumhara banke mujhe apna wajood paana hai.",
    date: "Trial by fire"
  },
  {
    language: "Hindi",
    greeting: "MERI MANZIL,",
    content: "Maine socha tha akele tai karunga ye safar. Par jab tum saath mile, safar hi khoobsurat lagne laga, manzil se bhi zyada.",
    date: "The Journey"
  },
  {
    language: "Hindi",
    greeting: "MERI IBADAT,",
    content: "Tera pyaar wo tilism hai jise main tootne nahi dunga. Ek fakir ki jholi mein, tu sabse keemti fariyad banke aayi hai.",
    date: "My only treasure"
  },
  {
    language: "Hindi",
    greeting: "MERA NOOR,",
    content: "Subah ki pehli kiran aur tumhara chehra. Dono ki chamak rooh mein utar aati hai aur dilon ke andheron ko mita deti hai.",
    date: "Morning light"
  },
  {
    language: "Hindi",
    greeting: "MERA AAKHRI PYAAR,",
    content: "Mohabbat ki zanjeer nahi, ye ek hawa hai jisme main udna chahta hoon. Tere ishq mein mujhe mukti mili hai, azaadi mili hai.",
    date: "Liberation"
  },
  {
    language: "Hindi",
    greeting: "MERI PREM KI MOORAT,",
    content: "Log pathar ki murti poojte hain, main apne dil mein basai hui teri iss moorat ko har subah poojta hoon.",
    date: "True faith"
  },
  {
    language: "Hindi",
    greeting: "MERA NASEEB,",
    content: "Taare ginte ginte jo dua maine ki, wo sach ho gayi jab tu meri zindagi ban ke mere samne aa khadi hui.",
    date: "Written fate"
  },
  {
    language: "Hindi",
    greeting: "MERI RAHAT,",
    content: "Jaise pyaase ko pani, jaise rote ko hasi, tujhse judi hai meri har ek kadi. Tere siva meri na koi pehchan hai, na aawaz.",
    date: "The deepest comfort"
  },

  // -----------------------------------------
  // GUJARATI SHAYARI / POETRY (25)
  // -----------------------------------------
  {
    language: "Gujarati",
    greeting: "મારો પ્રેમ,",
    content: "તારી આંખોમાં જે દરિયો છે ને, એમાં જ મારે ડૂબી જવું છે. મીરાં જેમ કૃષ્ણ માટે ઘેલી હતી, હું તારા પ્રેમમાં એમ જ ઘેલો થયો છું.",
    date: "Always & Forever"
  },
  {
    language: "Gujarati",
    greeting: "મારી જાન,",
    content: "સાંજ પડે ને તારી યાદ આવે, શ્વાસ ચાલે ને તારું નામ આવે. મારું આખું અસ્તિત્વ બસ તારી આસપાસ જ ફર્યા કરે છે.",
    date: "My whole heart"
  },
  {
    language: "Gujarati",
    greeting: "મારો શ્વાસ,",
    content: "પ્રેમ એટલે શું એ મેં ચોપડીઓમાં વાંચ્યું હતું, પણ તને જોયા પછી સમજાયું કે પ્રેમ એટલે તું અને માત્ર તું જ.",
    date: "You are the meaning"
  },
  {
    language: "Gujarati",
    greeting: "મારી દુનિયા,",
    content: "કબીરના દોહા જેવી તારી વાતો, અને મીરાંના ભજન જેવો તારો અવાજ. તું મારી પાસે હોય એટલે મારું આખું જગત પવિત્ર થઈ જાય છે.",
    date: "Sacred moments"
  },
  {
    language: "Gujarati",
    greeting: "મારું સર્વસ્વ,",
    content: "જો ભગવાન મને પૂછે કે તારી છેલ્લી ઈચ્છા શું છે? તો હું કહું કે મને સાત જન્મ સુધી બસ તારો જ સાથ જોઈએ છે.",
    date: "Seven lifetimes"
  },
  {
    language: "Gujarati",
    greeting: "મારું હૃદય,",
    content: "હવા જ્યારે મારા ચહેરાને અડે છે, ત્યારે મને તારા સ્પર્શનો જ અહેસાસ થાય છે. તું ભલે દૂર હોય, પણ મારા શ્વાસમાં તું જ વસે છે.",
    date: "Close to my soul"
  },
  {
    language: "Gujarati",
    greeting: "મારો શુકન,",
    content: "તારી એક સ્મિત માટે હું આખી દુનિયા જીતી શકું. તારું હસવું એ જ મારું સૌથી મોટું ઇનામ છે.",
    date: "Your smile"
  },
  {
    language: "Gujarati",
    greeting: "મારું નસીબ,",
    content: "તારા વગર મારી જિંદગી એ કાગળના ટુકડા સમાન હતી. તું આવી અને એ કાગળ પર પ્રણયની સુંદર કવિતા લખાઈ ગઈ.",
    date: "A beautiful poem"
  },
  {
    language: "Gujarati",
    greeting: "મારો જીવ,",
    content: "પગલાં ભલે જમીન પર પડે, પણ મારું મન તો તારી યાદોના આકાશમાં જ ઊડતું રહે છે.",
    date: "Flying with you"
  },
  {
    language: "Gujarati",
    greeting: "મારું સપનું,",
    content: "દુનિયાની નજરમાં તું એક વ્યક્તિ છે, પણ મારી નજરમાં તું મારી આખી દુનિયા છે.",
    date: "My universe"
  },
  {
    language: "Gujarati",
    greeting: "મારી મંઝિલ,",
    content: "રસ્તો ગમે તેવો હોય, પણ જો મારો હાથ તારા હાથમાં હશે, તો હું કાંટા પર પણ ફૂલની જેમ ચાલી શકીશ.",
    date: "Hand in hand"
  },
  {
    language: "Gujarati",
    greeting: "મારો ચાંદ,",
    content: "રાત્રે ચાંદને જોવું એટલે જાણે તારા ચહેરાને જોવો. બંને એટલા જ નિર્મળ અને શાંત લાગે છે.",
    date: "Peaceful nights"
  },
  {
    language: "Gujarati",
    greeting: "મારો આનંદ,",
    content: "તારા નામનો જાપ મારા હોઠો પર એમ જ રહે છે, જેમ મંદિરમાં ભગવાનનું નામ. તારો પ્રેમ મારી ભક્તિ છે.",
    date: "Devotion"
  },
  {
    language: "Gujarati",
    greeting: "મારી પ્રેરણા,",
    content: "જિંદગીની ભાગદોડમાં જ્યારે હું થાકી જાઉં છું, ત્યારે તારો ખોળો જ મારું આશ્રયસ્થાન બની જાય છે.",
    date: "My safe haven"
  },
  {
    language: "Gujarati",
    greeting: "મારી ચાહત,",
    content: "લોકો ઈશ્વર પાસે ધન માંગે છે, અને મેં મારા બંને હાથ જોડીને માત્ર તને જ માંગી છે.",
    date: "My only prayer"
  },
  {
    language: "Gujarati",
    greeting: "મારો સંગાથ,",
    content: "મારા હૃદયના દરેક ધબકારામાં તારું જ ગીત વાગે છે. આ સંગીત હવે મારા જીવનનો આધાર બની ગયું છે.",
    date: "The heartbeat"
  },
  {
    language: "Gujarati",
    greeting: "મારી પરછાઈ,",
    content: "મારા પડછાયાને પણ તારી આદત પડી ગઈ છે. તારા વિના એ પણ એકલો પડી જાય છે.",
    date: "Always together"
  },
  {
    language: "Gujarati",
    greeting: "મારો વિશ્વાસ,",
    content: "મારા દરેક અધૂરા શ્વાસને તારા શ્વાસથી પૂરો કરવો છે. મારી જિંદગીની શરૂઆત અને અંત બસ તું જ છે.",
    date: "Beginning and end"
  },
  {
    language: "Gujarati",
    greeting: "મારી કુંડળી,",
    content: "તારા પ્રેમનો રંગ એવો પાકો ચડ્યો છે કે હવે આ જનમમાં તો બીજો કોઈ રંગ મને ગમતો જ નથી.",
    date: "Colored in love"
  },
  {
    language: "Gujarati",
    greeting: "મારી રાહત,",
    content: "તારી આંખોમાં જે જાદુ છે, તે દુનિયાના કોઈ જાદુગર પાસે નથી. એક જ નજરમાં તું મારું સર્વસ્વ લૂંટી લે છે.",
    date: "Mesmerized"
  },
  {
    language: "Gujarati",
    greeting: "મારું સત્ય,",
    content: "સૂર્યની ગરમી કરતાં પણ વધારે તેજ તારા પ્રેમના ઉષ્મામાં છે. તારા પ્રેમની ગરમાહટ મારું જીવન ચલાવે છે.",
    date: "Warmth of love"
  },
  {
    language: "Gujarati",
    greeting: "મારી રોશની,",
    content: "મારા જીવનના અંધકારમાં તું એક દીપક બનીને આવી છે, જેનાથી મારું સમગ્ર વિશ્વ પ્રકાશિત થઈ ગયું છે.",
    date: "Light in darkness"
  },
  {
    language: "Gujarati",
    greeting: "મારો વિચાર,",
    content: "જો કોઈ મને મારા વિચારો ચોરી લેવાનું કહે, તો તેને માત્ર તારું જ નામ મળશે.",
    date: "Only you"
  },
  {
    language: "Gujarati",
    greeting: "મારી હસી,",
    content: "મારા હોઠો પર જે મુસ્કાન છે, એનું એકમાત્ર કારણ તું છે. તું ખુશ રહે એટલે હું ખુશ.",
    date: "Reason to smile"
  },
  {
    language: "Gujarati",
    greeting: "મારી પ્રાણ,",
    content: "મારો પ્રેમ શબ્દોમાં વર્ણવી શકાય એવો નથી, તે માત્ર હૃદયથી જ અનુભવી શકાય એવો છે.",
    date: "Beyond words"
  },

  // -----------------------------------------
  // ENGLISH POETRY / SHAYARI (25)
  // -----------------------------------------
  {
    language: "English",
    greeting: "MY SOULMATE,",
    content: "Like Mirabai's unwavering devotion, my love for you runs deeper than the oceans. I read the scriptures of love in your eyes, and every beat of my heart is a prayer dedicated to you.",
    date: "Timeless devotion"
  },
  {
    language: "English",
    greeting: "MY EVERYTHING,",
    content: "Kabir said love cannot be bought, it can only be given completely. I surrender my entire existence to you. You are the poetry I want to write for the rest of my life.",
    date: "Total surrender"
  },
  {
    language: "English",
    greeting: "MY STARLIGHT,",
    content: "In a universe of billions of galaxies, my soul traveled through the cosmos just to collide with yours. You are the gravity that keeps my world spinning.",
    date: "Cosmic love"
  },
  {
    language: "English",
    greeting: "MY DEAREST,",
    content: "Your voice is the sanctuary where my mind finds peace. In a world of deafening noise, your laugh is the only melody I ever want to hear.",
    date: "My sanctuary"
  },
  {
    language: "English",
    greeting: "MY BELOVED,",
    content: "If my love for you were translated into water, it would drown the world. If it were light, it would blind the sun. It is fierce, it is pure, and it is entirely yours.",
    date: "Fierce love"
  },
  {
    language: "English",
    greeting: "MY HEART,",
    content: "I didn't believe in magic until I saw you smile. It was as if all the darkness in my life was instantly extinguished by the blinding light of your soul.",
    date: "Pure magic"
  },
  {
    language: "English",
    greeting: "TO MY DESTINY,",
    content: "I have walked through a thousand lives just to find you in this one. And I would walk through a thousand more, just to hold your hand again.",
    date: "Written in fate"
  },
  {
    language: "English",
    greeting: "MY SUNSHINE,",
    content: "You are the quiet moment after a storm. The gentle breeze on a summer evening. You are everything good, everything beautiful in my world.",
    date: "My peace"
  },
  {
    language: "English",
    greeting: "MY LIFELINE,",
    content: "They say you only fall in love once. But that's a lie. Every time I look at you, I fall in love all over again, deeper than before.",
    date: "Falling forever"
  },
  {
    language: "English",
    greeting: "MY ETERNAL,",
    content: "Time stops when I am with you. The hands of the clock freeze, and the world fades away, leaving only you, me, and this beautiful infinite moment.",
    date: "Infinite moment"
  },
  {
    language: "English",
    greeting: "MY ANGEL,",
    content: "I used to look for poetry in books. Now, I just look at you. Your very existence is a masterpiece written by God Himself.",
    date: "Masterpiece"
  },
  {
    language: "English",
    greeting: "MY HOME,",
    content: "Home is not a place with walls and a roof. Home is wherever you are. Your arms are the only shelter my soul will ever need.",
    date: "Safe haven"
  },
  {
    language: "English",
    greeting: "MY DREAM,",
    content: "I pinch myself every morning, just to make sure you are real. Because someone as perfect as you could only exist in the most beautiful of dreams.",
    date: "Dream come true"
  },
  {
    language: "English",
    greeting: "MY MUSE,",
    content: "Every love song on the radio suddenly makes sense. Every romantic movie falls short of what we have. Our story is my favorite of all time.",
    date: "The greatest story"
  },
  {
    language: "English",
    greeting: "MY ANCHOR,",
    content: "When the oceans of life get rough, your love is the anchor that keeps me grounded. With you, I am never lost.",
    date: "Unshakable"
  },
  {
    language: "English",
    greeting: "MY FOREVER,",
    content: "I don't just love you for who you are, but for who I am when I am with you. You bring out the absolute best parts of my soul.",
    date: "Better together"
  },
  {
    language: "English",
    greeting: "MY BREATH,",
    content: "If I had a single breath left, I would use it to say 'I love you'. Because loving you is the very reason I was given breath to begin with.",
    date: "Last breath"
  },
  {
    language: "English",
    greeting: "MY LIGHT,",
    content: "I love you past the moon, beyond the stars, and through the fabric of time itself. Nothing in this universe could ever measure the depth of my love.",
    date: "Beyond the stars"
  },
  {
    language: "English",
    greeting: "MY HAPPINESS,",
    content: "Your smile is my sunrise. Your laugh is my favorite song. Your happiness is my life's greatest mission.",
    date: "My mission"
  },
  {
    language: "English",
    greeting: "MY RHYTHM,",
    content: "My heart beats in a rhythm that spells your name. It is a drum that marches only for you, a melody that belongs entirely to your soul.",
    date: "Heartbeat"
  },
  {
    language: "English",
    greeting: "MY PEACE,",
    content: "I look at you and see the rest of my life in front of my eyes. A life filled with laughter, warmth, and an endless, unwavering love.",
    date: "Looking ahead"
  },
  {
    language: "English",
    greeting: "MY QUEEN,",
    content: "In the kingdom of my heart, you are the only ruler. My devotion to you is absolute, my loyalty is unbreakable, and my love is eternal.",
    date: "Absolute devotion"
  },
  {
    language: "English",
    greeting: "MY TREASURE,",
    content: "If I could capture the stars and give them to you, I would. But even the brightest stars pale in comparison to the light you bring into my life.",
    date: "Brighter than stars"
  },
  {
    language: "English",
    greeting: "MY COMPASS,",
    content: "Wherever I go, my soul always points back to you. You are my true north, the compass that guides me through the darkest nights.",
    date: "True North"
  },
  {
    language: "English",
    greeting: "MY EVERYTHING,",
    content: "I promise to love you, not just for the rest of my life, but for the rest of yours. Through every season, every storm, and every beautiful sunny day.",
    date: "A solemn vow"
  }
];
