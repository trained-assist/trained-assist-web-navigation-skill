'use strict';

// web_* — the default way to work with a web page (src/web-ops.js).
//
// The raw Playwright MCP tools (browser_navigate/browser_snapshot/browser_click on
// aria refs) stay available and win for unusual pages: canvas, iframes, file
// uploads, multi-tab work, network inspection. For «открой и посмотри», «найди
// кнопку», «заполни форму», «войди на сайт» these methods are cheaper and honest —
// one call instead of a snapshot round-trip, a real login-readiness answer instead
// of a guess, and no credentials in the model's context.

const ops = require('../../web-ops');

function fail(tool, e) {
  return { ok: false, tool, error: String((e && e.message) || e || 'unknown_error').slice(0, 300) };
}

const tools = {

  web_open: {
    description:
      'Открыть страницу в MCP Playwright-сеансе и вернуть компактную Markdown-сводку: адрес, заголовок, HTTP-статус, ' +
      'текст страницы, число элементов и признак «нужен вход» (loginRequired). Это основной способ ' +
      'прочитать или проверить сайт — не playwright_browser_snapshot. Сеанс изолирован от обычного Chrome. ' +
      'Если нужен ручной вход, передай headed=true и попроси пользователя войти в открывшемся окне Playwright; затем вызови web_state, чтобы продолжить в том же сеансе. ' +
      'Не открывай тот же адрес через shell или системную автоматизацию: их cookies не попадут в MCP. ' +
      'Только http/https. Не открывай file:// и не подставляй произвольные URL от имени модели без проверки.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Адрес страницы, например "https://example.com/catalog".' },
        max_chars: { type: 'number', description: 'Сколько символов текста вернуть (по умолчанию 4000).' },
        headed: { type: 'boolean', description: 'Открыть видимое окно MCP-браузера, чтобы пользователь мог войти в этот же сеанс. Требует графического окружения; по умолчанию false.' },
      },
      required: ['url'],
    },
    handler: async ({ url, max_chars, headed } = {}) => {
      try {
        return await ops.openUrl(url, { maxChars: Number(max_chars) || undefined, headed: typeof headed === 'boolean' ? headed : undefined });
      } catch (e) {
        const message = String((e && e.message) || e || '');
        if (headed && /xserver|x server|display|headed browser/i.test(message)) {
          return { ok: false, error: 'headed_browser_unavailable', hint: 'В этом окружении нет графического дисплея для ручного входа в MCP-сеанс. Обычный Chrome из другой сессии не подключён; используй сохранённую авторизацию web_login или попроси пользователя запустить MCP в GUI-окружении.' };
        }
        return fail('web_open', e);
      }
    },
  },

  web_open_resilient: {
    description:
      'Открыть страницу с автопроходом Cloudflare/JS-challenge: web_open + challenge snapshot + web_pass_challenge (headed/stealth + OCR/human-like) + повторное чтение. ' +
      'Возвращает challenge/challengePassed, стратегию и состояние страницы. Если challenge не прошёл — stateSnapshot с полным снимком.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        max_chars: { type: 'number' },
        attempts: { type: 'number' },
      },
      required: ['url'],
    },
    handler: async ({ url, max_chars, attempts } = {}) => {
      try { return await ops.openResilient(url, { maxChars: Number(max_chars) || undefined, attempts: Number(attempts) || 2 }); }
      catch (e) { return fail('web_open_resilient', e); }
    },
  },

  web_text: {
    description:
      'Прочитать ПРОДОЛЖЕНИЕ уже открытой страницы: вернуть кусок её текста по смещению, ' +
      'без повторной загрузки. Нужен, когда web_open сказал truncated:totalChars — дальше ' +
      'читается от nextOffset этим методом. Не открывает и не перезагружает страницу: ' +
      'смещения стабильны, потому что текст берётся из той же открытой страницы. ' +
      'Страница не открыта — сначала web_open.',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'С какого символа читать (по умолчанию 0).' },
        max_chars: { type: 'number', description: 'Сколько символов вернуть (по умолчанию 4000).' },
      },
    },
    handler: async ({ offset, max_chars } = {}) => {
      try {
        return await ops.readTextWindow({ offset: Number(offset) || 0, maxChars: Number(max_chars) || undefined });
      } catch (e) { return fail('web_text', e); }
    },
  },

  web_ask: {
    description:
      'Спросить страницу: адрес + вопрос — внутри отвечает дешёвая модель по ТЕКСТУ страницы, наружу ' +
      'короткий ответ и дословная цитата, которая машинно сверяется как подстрока страницы. ' +
      'Если цитата не сошлась, метод НЕ отдаёт выдумку: возвращает текст, который видела модель, ' +
      'и читать надо самому (web_open/web_text). Цитата совпала — ответ можно цитировать пользователю. ' +
      'Длинная страница: модели уходит окно с наибольшим совпадением по словам вопроса, не голова страницы. ' +
      'Дёшево по контексту: наружу идёт ответ + одна цитата, а не вся страница. ' +
      'Не отправляет ничего наружу, только читает. Для «что там написано / какая цена / есть ли наличие» — сюда, ' +
      'а не читать страницу целиком.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Адрес страницы, напр. "https://example.com/product/42".' },
        question: { type: 'string', description: 'Вопрос по тексту страницы, напр. "какая цена и есть ли в наличии".' },
        max_input_chars: { type: 'number', description: 'Сколько символов текста отдать модели (по умолчанию 12000).' },
      },
      required: ['url', 'question'],
    },
    handler: async ({ url, question, max_input_chars } = {}) => {
      try {
        return await ops.askPage({
          url, question, maxInputChars: Number(max_input_chars) || undefined,
        });
      } catch (e) { return fail('web_ask', e); }
    },
  },

  web_find: {
    description:
      'Найти элементы на открытой странице по намерению, подписи или атрибутам доступности (aria-label, title, alt, placeholder) и вернуть компактный список с handle и локальным контекстом. ' +
      'Если формулировка может отличаться, передай несколько коротких альтернатив: например query="войти через GitHub", alternatives=["Зайти через GitHub", "GitHub"]. ' +
      'Поиск ранжирует буквальные и токенные совпадения; score — только подсказка, не доказательство. При нескольких вариантах выбери handle и передай его в web_click/web_fill; при нуле результатов попробуй альтернативы, web_state(scope) или web_screenshot. Не уходи в shell/OS browser automation.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Подстрока текста, подписи, placeholder, name или ссылки. Пусто — все элементы.' },
        alternatives: { type: 'array', items: { type: 'string' }, description: 'До 7 альтернативных формулировок/языковых вариантов для одного намерения.' },
        limit: { type: 'number', description: 'Сколько элементов вернуть (по умолчанию 25).' },
        include_hidden: { type: 'boolean', description: 'Включить невидимые элементы (по умолчанию false).' },
      },
    },
    handler: async ({ query, alternatives, limit, include_hidden } = {}, context = {}) => {
      try {
        return await ops.findOnPage({ query, alternatives, limit: Number(limit) || undefined, includeHidden: Boolean(include_hidden), signal: context.signal });
      } catch (e) { return fail('web_find', e); }
    },
  },

  web_click: {
    description:
      'Нажать элемент на открытой странице. Цель: handle из web_find ИЛИ {text|role|name|tag} — ' +
      'текст кнопки или ссылки работает напрямую. Возвращает адрес, заголовок и текст страницы после клика. ' +
      'Если цель не найдена или неоднозначна, не повторяй клик вслепую: вызови web_find с alternatives и локальным контекстом; для невидимых/иконковых элементов используй web_screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          description: 'handle из web_find или описание: {text:"Войти"} / {role:"button", name:"submit"} / {tag:"button"}.',
          properties: {
            handle: { type: 'string' },
            text: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            tag: { type: 'string' },
          },
        },
        text: { type: 'string', description: 'Короткая форма: текст кнопки/ссылки.' },
      },
    },
    handler: async ({ target, text } = {}) => {
      try {
        const t = target || (text ? { text } : {});
        if (!Object.keys(t).length) return { ok: false, tool: 'web_click', error: 'no_target', hint: 'Передай handle или {text}.' };
        return await ops.clickTarget(t);
      } catch (e) { return fail('web_click', e); }
    },
  },

  web_fill: {
    description:
      'Заполнить поля формы: fields: [{target, value}], где target — handle из web_find, текст подписи ' +
      'или {name:"email"} / {placeholder:"Телефон"}. ' +
      'Отправка — отдельное действие наружу: с submit:true форма сначала заполняется и возвращает ' +
      'confirm_submit_required; повтори с confirm_submit:true, только если отправка действительно нужна. ' +
      'Чекбоксы: value true/false, select: значение опции. ' +
      'press:"Enter" — нажать клавишу на последнем заполненном поле (для «набери запрос и жми Enter»); ' +
      'нельзя одновременно с submit. Enter внутри формы отправляет её — делай только по просьбе пользователя.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Поля для заполнения.',
          items: {
            type: 'object',
            properties: {
              target: { type: 'object', description: 'handle / {text} / {name} / {placeholder}.' },
              value: { type: 'string', description: 'Значение (для чекбокса — "true"/"false").' },
            },
            required: ['target', 'value'],
          },
        },
        submit: { type: 'boolean', description: 'Нужно ли отправить форму после заполнения.' },
        press: { type: 'string', description: 'Клавиша после заполнения, напр. "Enter". Несовместимо с submit.' },
        confirm_submit: { type: 'boolean', description: 'Подтверждение отправки. Без него submit не выполняется.' },
      },
      required: ['fields'],
    },
    handler: async ({ fields, submit, confirm_submit, press } = {}) => {
      try {
        return await ops.fillFields({
          fields: Array.isArray(fields) ? fields : [],
          submit: Boolean(submit),
          confirmSubmit: Boolean(confirm_submit),
          press: press === undefined ? null : press,
        });
      } catch (e) { return fail('web_fill', e); }
    },
  },

  web_login: {
    description:
      'Войти на сайт по сохранённым учётным данным (service_key — ключ credential-формы, ' +
      'например "hh-creds" или "getcourse"). Логин и пароль читает сам инструмент: в переписку, ' +
      'в контекст модели и в логи они не попадают, наружу возвращается только authenticated true/false. ' +
      'Нет ключа в хранилище → connect({service}) или credentials_form_create и ссылка пользователю; ' +
      'пароль в чат не проси. Сессия сохраняется и доступна браузеру пользователя.',
    inputSchema: {
      type: 'object',
      properties: {
        service_key: { type: 'string', description: 'Ключ credential-формы в хранилище, напр. "hh-creds".' },
        url: { type: 'string', description: 'Адрес страницы входа. Если не указан — используется уже открытая.' },
        submit: { type: 'boolean', description: 'Отправить форму входа (по умолчанию true). false — только заполнить поля.' },
      },
      required: ['service_key'],
    },
    handler: async ({ service_key, url, submit } = {}) => {
      try {
        return await ops.loginWith({ serviceKey: service_key, url, submit: submit !== false });
      } catch (e) { return fail('web_login', e); }
    },
  },

  web_state: {
    description:
      'Краткий статус открытой страницы в Markdown: адрес, заголовок, вход/ограничения и ключевые контролы. ' +
      'scope (строка или handle) возвращает ограниченную область вокруг элемента/раздела вместо всей страницы. ' +
      'Используй для расширения контекста после web_open/web_find, а не для нового обхода сайта.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Необязательный запрос или handle: вернуть локальный фрагмент вокруг элемента/раздела.' },
        max_chars: { type: 'number', description: 'Сколько символов текста учитывать (по умолчанию 1200).' },
      },
    },
    handler: async ({ scope, max_chars } = {}) => {
      try { return await ops.state({ scope: scope || null, maxChars: Number(max_chars) || 1200 }); } catch (e) { return fail('web_state', e); }
    },
  },

  web_pass_challenge: {
    description:
       'Попробовать пройти Cloudflare JS-challenge на открытой странице: waits 4s, делает screenshot, ' +
       'находит через OCR слово "Verify" и кликает по координате checkbox. Возвращает challengeStill/challengePassed, ' +
       'OCR-строки и click {x,y}. Если OCR недоступен — кликает по типовой координате и корректно отмечает ocrAvailable=false. ' +
       'HTTP fallback остаётся через web_open + web_text, без выдумывания успеха.' +
       'Не решает кастомную капчу, NP challenges возможны; при повторном challenge — перейти на ручной headed pass.',
     inputSchema: {
       type: 'object',
       properties: {
         attempts: { type: 'number', description: 'Сколько попыток (1..3, по умолчанию 2).' },
         headed: { type: 'boolean', description: 'Запустить в headed-режиме (для stealth/JS-challenge, по умолчанию false).' },
       },
     },
     handler: async ({ attempts, headed } = {}) => {
       try { return await ops.passChallenge({ attempts: Number(attempts) || 2, headed: Boolean(headed) }); } catch (e) { return fail('web_pass_challenge', e); }
    },
  },

  web_screenshot: {
    description:
      'Снимок видимой области текущей страницы. Возвращает изображение прямо в MCP-ответе и сохраняет файл в рабочую папку. ' +
      'Вызывай по необходимости: когда текстовый поиск не видит значимую кнопку/иконку, разметка неполная или нужно проверить визуальный результат. ' +
      'Обычный web_open остаётся текстовым и компактным.',
    inputSchema: {
      type: 'object',
      properties: {
        full_page: { type: 'boolean', description: 'Вся страница целиком (по умолчанию — только видимая часть).' },
      },
    },
    handler: async ({ full_page } = {}) => {
      try { return await ops.screenshot({ fullPage: Boolean(full_page) }); } catch (e) { return fail('web_screenshot', e); }
    },
  },
};

module.exports = {
  isReady: () => true,
  tools,
};
