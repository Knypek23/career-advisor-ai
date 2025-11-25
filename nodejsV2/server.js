require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors({
    origin: 'https://srv98741.seohost.com.pl',
    credentials: true
}));

app.use(express.static('public'));
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const przedmiotySchema = z.object({
  matematyka: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z matematyki"),
  "j. polski": z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z języka polskiego"),
  "j. angielski": z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z języka angielskiego"),
  fizyka: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z fizyki"),
  chemia: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z chemii"),
  biologia: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z biologii"),
  historia: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z historii"),
  geografia: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z geografii"),
  informatyka: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z informatyki"),
  WOS: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z WOS"),
  technika: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z techniki"),
  plastyka: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z plastyki"),
  muzyka: z.enum(["brak", "niski", "średni", "wysoki", "zabroniony"]).describe("Poziom umiejętności z muzyki")
});

const analizaOdpowiedzSchema = z.object({
  czy_powazna: z.boolean().describe("Czy wiadomość jest poważną wypowiedzią o przedmiotów szkolnych"),
  powód_niepoważna: z.string().optional().describe("Powód dlaczego wiadomość nie jest poważna"),
  komentarz: z.string().optional().describe("Komentarz do wiadomości użytkownika"),
  przedmioty: przedmiotySchema.describe("Analiza przedmiotów szkolnych"),
  zabronione_przedmioty: z.array(z.string()).optional().describe("Lista przedmiotów oznaczonych jako 'zabronione'")
});

async function generujMotywujacaOdpowiedz(originalMessage, analiza) {
  try {
    const prompt = `
Jesteś pomocnym asystentem, który pomaga uczniom w określeniu ich ścieżki kariery zawodowej.
Użytkownik napisał: "${originalMessage}"

Twoja wiadomość została przeanalizowana jako: ${analiza.czy_powazna ? 'poważna' : 'niepoważna'}
${analiza.powód_niepoważna ? `Powód: ${analiza.powód_niepoważna}` : ''}

Wygeneruj krótką, przyjazną i motywującą odpowiedź dla użytkownika, która:
1. Jeśli wiadomość była niepoważna - delikatnie zwróć uwagę i zachęć do szczerej odpowiedzi
2. Bądź wspierający i zrozumiały
3. Używaj naturalnego, młodzieżowego języka
4. Maksymalnie 2-3 zdania
5. Nie bądź zbyt moralizatorski

Przykłady odpowiedzi:
- Jeżeli jest niepoważna, zachęć go żeby podał jakieś przedmioty (NIE ODCIĄGAJ GO OD TEMATU PODANIA PRZEDMIOTU):
  a)Dla żartobliwych: "Hej, widzę że masz poczucie humoru! 😊 Ale serio, pomóż mi lepiej Cię poznać - jak Ci idzie z konkretnymi przedmiotami?"
  b)Dla negatywnych: "Rozumiem, że czasami szkoła może być frustrująca. Spróbujmy jednak znaleźć choć jeden przedmiot, który Ci niece lepiej idzie. Który to?"
  c)Dla przesadnych: "Wow, taki jesteś pewny siebie! 😄 A teraz na poważnie - pomóż mi zrozumieć naprawdę jak Ci idzie w szkole."
- Jeżeli odpowiedź użytkownika była poważna to napisz mu jakieś zdanie że fajnie zainteresowania oraz na końcu się zapytaj o jego cechy osobowości, ale nie sugeruj mu nic tylko napisz to mu otwartym pytaniem

Pamiętaj zawsze na końcu daj "😘"
Twoja odpowiedź:
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error('Błąd generowania odpowiedzi:', error);
    return "Dziękuję za wiadomość! Spróbujmy jeszcze raz - opowiedz mi szczerze o swoich przedmiotach szkolnych.";
  }
}

app.post('/api/analyze-subjects', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Wiadomość jest wymagana' });
    }

    const prompt = `
Przeanalizuj poniższy tekst użytkownika dotyczący przedmiotów szkolnych, potrzebnych do wyboru odpowiedniej ścieżki zawodowej.

INSTRUKCJE KATEGORYCZNE:
1. **PIERWSZA KROK - OCENA POWAGI:** Przeanalizuj wiadomość pod kątem tonu i treści.
2. **REGUŁA WYKLUCZAJĄCA (PRZEKLEŃSTWA):** Jeśli wiadomość zawiera jakiekolwiek przekleństwo (np. "gówno", "k*rwa", itp.), MUSISZ ustawić "czy_powazna" na FALSE. To jest wymóg bezwzględny.
3. **REGUŁA WYKLUCZAJĄCA (SKRAJNOŚĆ):** Jeśli wiadomość sugeruje, że ABSOLUTNIE wszystkie przedmioty są na poziomie "brak" lub "wysoki" (jak w przypadku: "wszystko mi leży", "jestem geniuszem od wszystkiego" lub "wszystko to gówno"), MUSISZ ustawić "czy_powazna" na FALSE. To jest wymóg bezwzględny.
4. **NOWA REGUŁA - ZABRONIONE PRZEDMIOTY:** Jeśli użytkownik wyraża SILNĄ NIECHĘĆ lub NIENAWIDZI konkretnego przedmiotu (słowa klucze: "nienawidzę", "nie cierpię", "nie znoszę", "strasznie nie lubię", "okropny", "beznadziejny"), oznacz ten przedmiot jako "zabroniony".
5. Dla wiadomości, które przejdą powyższe filtry, oceń je jako POWAŻNE (czy_powazna: TRUE).
6. Dla poważnych wypowiedzi - przeanalizuj przedmioty szkolne i określ poziom umiejętności (niski/średni/wysoki/brak/zabroniony).
7. Uwzględnij typowe określenia: "dobra", "słaba", "średnia", "dobrze mi idzie", "kiepsko", "excel", "słabo", "super", "beznadziejnie" itp.
8. Dla silnie negatywnych określeń używaj poziomu "zabroniony".
9. Zwróć tylko przedmioty wspomniane w tekście, dla nie wspomnianych użyj "brak"
10. Bądź surowy w ocenianiu, jeżeli chociaż jedna rzecz powoduje że zdanie jest nierealne/prześmiewcze szczególnie gdy użytkownik wyraża negatywny stosunek do wszystkich przedmiotów szkolnych, MUSISZ ustawić "czy_powazna" na FALSE. To jest wymóg bezwzględny.
11.Po ocenianiu każdego przedmiotu SPRAWDŹ JESZCZE RAZ jeżeli wszystko jest brak lub zabroniony to MUSISZ absolutnie ustawić "czy_powazna" na FALSE
Tekst użytkownika: "${message}"
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(analizaOdpowiedzSchema),
      },
    });

    const analiza = analizaOdpowiedzSchema.parse(JSON.parse(response.text));
    
    const odpowiedzDlaUzytkownika = await generujMotywujacaOdpowiedz(message, analiza);
    
    if (!analiza.czy_powazna) {
      res.json({
        success: true,
        powazna: false,
        powód: analiza.powód_niepoważna,
        komentarz: analiza.komentarz,
        odpowiedz: odpowiedzDlaUzytkownika,
        ostrzeżenie: "Wiadomość zawiera żart lub nieodpowiednią treść",
        przedmioty: analiza.przedmioty,
        zabronione_przedmioty: analiza.zabronione_przedmioty || []
      });
    } else {
      res.json({ 
        success: true,
        powazna: true,
        przedmioty: analiza.przedmioty,
        komentarz: analiza.komentarz,
        odpowiedz: odpowiedzDlaUzytkownika,
        zabronione_przedmioty: analiza.zabronione_przedmioty || []
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Wystąpił błąd podczas analizy przedmiotów',
      details: error.message
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Wiadomość jest wymagana' });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: message
    });

    res.json({ 
      response: response.text 
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Wystąpił błąd',
      details: error.message
    });
  }
});

app.get('/api/test-subjects', async (req, res) => {
  try {
    const testCases = [
      "MATMA dobra, polak słabo, angol średnio, fizyka super, chemia kiepsko",
      "Wszystkie przedmioty to gówno i mnie nie interesują",
      "Jestem mistrzem świata od wszystkiego, nawet od plastyki i muzyki!",
      "Technika mi idzie, muzyka średnio, plastyka słabo",
      "Nie lubię szkoły, wszystko mi leży...",
      "Matematyka - wysoki poziom, język polski - średni, technika - niski",
      "Nienawidzę matematyki i chemii, ale lubię biologię",
      "Nie cierpię historii i geografii"
    ];

    const results = [];

    for (const testMessage of testCases) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: `Przeanalizuj tekst użytkownika: "${testMessage}"`,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: zodToJsonSchema(analizaOdpowiedzSchema),
          },
        });

        const analiza = analizaOdpowiedzSchema.parse(JSON.parse(response.text));
        
        const odpowiedz = await generujMotywujacaOdpowiedz(testMessage, analiza);
        
        results.push({
          testMessage,
          analiza,
          odpowiedz_dla_uzytkownika: odpowiedz
        });
      } catch (error) {
        results.push({
          testMessage,
          error: error.message
        });
      }
    }

    res.json({ 
      success: true,
      testResults: results,
      message: 'Test analizy różnych wypowiedzi zakończony!'
    });
    
  } catch (error) {
    console.error('Test subjects error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

app.post('/api/test-single', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Wiadomość jest wymagana' });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Przeanalizuj tekst użytkownika: "${message}"`,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(analizaOdpowiedzSchema),
      },
    });

    const analiza = analizaOdpowiedzSchema.parse(JSON.parse(response.text));
    
    const odpowiedz = await generujMotywujacaOdpowiedz(message, analiza);

    res.json({
      success: true,
      originalMessage: message,
      czy_powazna: analiza.czy_powazna,
      powód_niepoważna: analiza.powód_niepoważna,
      komentarz: analiza.komentarz,
      odpowiedz_dla_uzytkownika: odpowiedz,
      przedmioty: analiza.przedmioty,
      zabronione_przedmioty: analiza.zabronione_przedmioty || []
    });
    
  } catch (error) {
    console.error('Test single error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const models = await ai.models.list();
    res.json({
      models: models.map(model => ({
        name: model.name,
        displayName: model.displayName
      }))
    });
  } catch (error) {
    console.error('Models error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/suggest-careers', async (req, res) => {
  try {
    const { przedmioty, zabronione_przedmioty = [] } = req.body;
    
    console.log('Proxy: Otrzymano żądanie dla przedmiotów:', przedmioty);
    
    if (!przedmioty || typeof przedmioty !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'Brak danych o przedmiotach' 
      });
    }

    const phpResponse = await fetch('https://srv98741.seohost.com.pl/php/suggest_careers.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        przedmioty: przedmioty,
        zabronione_przedmioty: zabronione_przedmioty
      })
    });

    if (!phpResponse.ok) {
      throw new Error(`PHP response: ${phpResponse.status}`);
    }

    const data = await phpResponse.json();
    
    console.log('Proxy: Zwracam dane:', data);
    res.json(data);

  } catch (error) {
    console.error('Błąd proxy do PHP:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd połączenia z serwerem PHP: ' + error.message
    });
  }
});
const analizaCechSchema = z.object({
  cechy_uzytkownika: z.array(z.string()).describe("Lista cech charakteru wykrytych w wiadomości użytkownika"),
  dopasowane_zawody: z.array(z.string()).describe("Lista aliasów zawodów które pasują do wykrytych cech charakteru"),
  komentarz: z.string().optional().describe("Komentarz do analizy cech charakteru")
});

app.post('/api/analyze-traits', async (req, res) => {
  try {
    const { message, availableTraits } = req.body;
    
    if (!message || !availableTraits) {
      return res.status(400).json({ 
        error: 'Wiadomość i dostępne cechy są wymagane' 
      });
    }

    const prompt = `
Jesteś asystentem doradztwa zawodowego. Przeanalizuj poniższą wiadomość użytkownika i znajdź w niej cechy charakteru.

DOSTĘPNE CECHY CHARAKTERU Z BAZY DANYCH (tylko te możesz używać):
${availableTraits.map(trait => `- ${trait}`).join('\n')}

TEKST UŻYTKOWNIKA: "${message}"

INSTRUKCJE:
1. Znajdź wszystkie cechy charakteru które pasują do dostępnej listy
2. Zwróć tylko cechy które WYRAŹNIE WYNIKAJĄ z tekstu
3. Nie wymyślaj cech których nie ma na liście
4. Bądź konserwatywny - lepiej zwrócić mniej cech niż dodawać niepewne
5. Dla każdej cechy z listy sprawdź czy występuje w tekście użytkownika

Zwróć JSON z listą znalezionych cech.

Przykład:
"potrafię przekonywać ludzi do swojej racji" możesz potraktować jako negocjacje
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(analizaCechSchema),
      },
    });

    const analiza = analizaCechSchema.parse(JSON.parse(response.text));
    
    res.json({
      success: true,
      cechy_uzytkownika: analiza.cechy_uzytkownika,
      dopasowane_zawody: analiza.dopasowane_zawody,
      komentarz: analiza.komentarz
    });
    
  } catch (error) {
    console.error('Error analizy cech:', error);
    res.status(500).json({ 
      error: 'Wystąpił błąd podczas analizy cech charakteru',
      details: error.message
    });
  }
});
app.post('/api/find-careers-by-traits', async (req, res) => {
  try {
    const { cechy_charakteru, limit = 10 } = req.body;
    
    console.log('Proxy cechy: Otrzymano cechy:', cechy_charakteru);
    
    if (!cechy_charakteru || !Array.isArray(cechy_charakteru)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Brak danych o cechach charakteru' 
      });
    }

    const phpResponse = await fetch('https://srv98741.seohost.com.pl/php/find_careers_by_traits.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cechy_charakteru: cechy_charakteru,
        limit: limit
      })
    });

    if (!phpResponse.ok) {
      throw new Error(`PHP response: ${phpResponse.status}`);
    }

    const data = await phpResponse.json();
    
    console.log('Proxy cechy: Zwracam dane:', data);
    res.json(data);

  } catch (error) {
    console.error('Błąd proxy cech do PHP:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd połączenia z serwerem PHP: ' + error.message
    });
  }
});

app.get('/api/character-traits', async (req, res) => {
  try {
    
    const phpURL = 'https://srv98741.seohost.com.pl/php/get_character_traits.php';
    
    const phpResponse = await fetch(phpURL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });


    if (!phpResponse.ok) {
      const errorText = await phpResponse.text();
      console.log('🔴 Pełna odpowiedź błędu PHP:', errorText);
      throw new Error(`PHP response: ${phpResponse.status} - ${phpResponse.statusText}. Details: ${errorText}`);
    }

    const data = await phpResponse.json();
    
    res.json(data);
    
  } catch (error) {
    console.error('🔴 Pełny błąd pobierania cech:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania cech charakteru: ' + error.message
    });
  }
});
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Node.js API działa!', 
        timestamp: new Date(),
        endpoints: [
            '/api/models',
            '/api/analyze-subjects', 
            '/api/suggest-careers'
        ]
    });
});
app.listen(port, () => {
  console.log(`Serwer Node.js działa na http://localhost:${port}`);
  console.log(`Obsługuje tylko analizę AI przez Gemini`);
});