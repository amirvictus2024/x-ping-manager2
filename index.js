const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const cron = require('node-cron');
const moment = require('moment');

// تنظیمات اولیه
const BOT_TOKEN = '8069263840:AAF2JTFJl6cfo7z1rU_CegYnCNJH6bLXcg0'; // توکن ربات (به صورت ثابت داخل کد)
const ADMIN_ID = 6712954701; // آی‌دی تلگرامی ادمین
const DATA_FILE = 'bot_data.json';

// ساختار داده‌های ربات
let botData = {
  scheduledMessages: [],
  welcomeMessages: {},
  channels: [],
  delayedMessages: []
};

// بارگذاری اطلاعات از فایل (در صورت وجود)
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      botData = JSON.parse(data);
      console.log('اطلاعات با موفقیت بارگذاری شد.');
    }
  } catch (error) {
    console.error('خطا در بارگذاری اطلاعات:', error);
  }
}

// ذخیره اطلاعات به فایل
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2), 'utf8');
    console.log('اطلاعات ذخیره شد.');
  } catch (error) {
    console.error('خطا در ذخیره اطلاعات:', error);
  }
}

// بررسی ادمین بودن کاربر
function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

const bot = new Telegraf(BOT_TOKEN);

// استفاده از middleware مدیریت جلسه telegraf
bot.use(session());

// نمایش پنل مدیریت در تلگرام
function showAdminPanel(ctx) {
  ctx.reply('🖥 پنل مدیریت:', Markup.inlineKeyboard([
    [Markup.button.callback('📝 ارسال پیام', 'send_message')],
    [Markup.button.callback('⏱ زمانبندی پیام', 'schedule_message')],
    [Markup.button.callback('⏲ پیام با تأخیر', 'delay_message')],
    [Markup.button.callback('📊 ایجاد نظرسنجی', 'create_poll')],
    [Markup.button.callback('👋 پیام خوشامدگویی', 'set_welcome')],
    [Markup.button.callback('👥 اعضای کانال', 'get_members')],
    [Markup.button.callback('📺 مدیریت کانال‌ها', 'manage_channels')],
    [Markup.button.callback('🔄 مدیریت پیام‌ها', 'manage_messages')]
  ]));
}

// دستور start
bot.start((ctx) => {
  if (isAdmin(ctx)) {
    ctx.reply(`سلام ${ctx.from.first_name}، به ربات مدیریت خوش آمدید!`);
    showAdminPanel(ctx);
  } else {
    ctx.reply('این ربات فقط برای مدیر مجاز است.');
  }
});

bot.command('panel', (ctx) => {
  if (isAdmin(ctx)) {
    showAdminPanel(ctx);
  } else {
    ctx.reply('دسترسی ندارید.');
  }
});

// middleware محدودسازی دسترسی برای callbackها
bot.use((ctx, next) => {
  if ((ctx.callbackQuery || ctx.updateType === 'message') && !isAdmin(ctx)) {
    return ctx.reply('⛔️ شما دسترسی به این بخش را ندارید.');
  }
  return next();
});

// ========================
// مدیریت کانال‌ها
// ========================

// نمایش پنل مدیریت کانال‌ها
bot.action('manage_channels', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  const buttons = botData.channels.map(ch =>
    [Markup.button.callback(`${ch.title}`, `channel_info:${ch.id}`)]
  );
  buttons.push([Markup.button.callback('➕ افزودن کانال جدید', 'add_channel')]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('مدیریت کانال‌ها:', Markup.inlineKeyboard(buttons));
});

// افزودن کانال
bot.action('add_channel', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.step = 'add_channel_username';
  ctx.reply('لطفاً نام کاربری کانال (با @) یا شناسه عددی را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
  ]));
});

// دریافت متن مربوط به افزودن کانال
bot.on('text', (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.trim();
  const step = ctx.session.step;

  if (step === 'add_channel_username') {
    // بررسی وجود کانال تکراری
    if (botData.channels.find(ch => ch.id === text)) {
      ctx.reply('این کانال قبلاً اضافه شده است.', Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
      ]));
      ctx.session.step = null;
      return;
    }
    ctx.session.newChannelId = text;
    ctx.session.step = 'add_channel_title';
    ctx.reply('نام نمایشی کانال را وارد کنید:', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'add_channel')]
    ]));
  } else if (step === 'add_channel_title') {
    const newChannel = {
      id: ctx.session.newChannelId,
      title: text,
      type: ctx.session.newChannelId.startsWith('@') ? 'channel' : 'group'
    };
    botData.channels.push(newChannel);
    saveData();
    ctx.reply(`✅ کانال "${newChannel.title}" اضافه شد.`, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت به مدیریت کانال‌ها', 'manage_channels')]
    ]));
    ctx.session.step = null;
  }
  // ==============================
  // دریافت متن مراحل دیگر
  // ==============================
  else if (step === 'send_message_text') {
    ctx.session.messageText = text;
    ctx.session.step = 'send_message_buttons';
    ctx.reply('آیا می‌خواهید دکمه اضافه کنید؟', Markup.inlineKeyboard([
      [Markup.button.callback('✅ بله', 'add_buttons')],
      [Markup.button.callback('❌ خیر', 'send_message_now')]
    ]));
  } else if (step === 'add_button_text') {
    ctx.session.currentButtonText = text;
    ctx.session.step = 'add_button_url';
    ctx.reply('لینک دکمه را وارد کنید:', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'add_buttons')]
    ]));
  } else if (step === 'add_button_url') {
    if (!ctx.session.messageButtons) ctx.session.messageButtons = [];
    ctx.session.messageButtons.push({
      text: ctx.session.currentButtonText,
      url: text
    });
    const preview = ctx.session.messageButtons.map(btn => `[${btn.text}](${btn.url})`).join('\n');
    ctx.reply(`دکمه اضافه شد:\n${preview}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن دکمه دیگر', 'add_buttons')],
      [Markup.button.callback('✅ ارسال پیام', 'send_message_now')]
    ])});
    ctx.session.step = 'send_message_buttons';
  } else if (step === 'schedule_message_text') {
    ctx.session.scheduleMessageText = text;
    ctx.session.step = 'schedule_message_time';
    ctx.reply('زمان ارسال را به فرمت HH:MM وارد کنید (مثلاً 14:30):', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'schedule_message')]
    ]));
  } else if (step === 'schedule_message_time') {
    if (!/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(text)) {
      return ctx.reply('فرمت زمان اشتباه است. لطفاً به صورت HH:MM وارد کنید.');
    }
    ctx.session.scheduleTime = text;
    ctx.session.step = 'schedule_message_days';
    ctx.reply('روزهای ارسال را انتخاب کنید:', Markup.inlineKeyboard([
      [
        Markup.button.callback('شنبه', 'schedule_day:6'),
        Markup.button.callback('یکشنبه', 'schedule_day:0'),
        Markup.button.callback('دوشنبه', 'schedule_day:1')
      ],
      [
        Markup.button.callback('سه‌شنبه', 'schedule_day:2'),
        Markup.button.callback('چهارشنبه', 'schedule_day:3'),
        Markup.button.callback('پنجشنبه', 'schedule_day:4')
      ],
      [
        Markup.button.callback('جمعه', 'schedule_day:5'),
        Markup.button.callback('هر روز', 'schedule_day:all')
      ],
      [Markup.button.callback('✅ ذخیره', 'save_schedule')],
      [Markup.button.callback('🔙 بازگشت', 'schedule_message')]
    ]));
  } else if (step === 'delay_message_text') {
    ctx.session.delayMessageText = text;
    ctx.session.step = 'delay_message_minutes';
    ctx.reply('تعداد دقیقه تأخیر را وارد کنید (مثلاً 10):', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'delay_message')]
    ]));
  } else if (step === 'delay_message_minutes') {
    const minutes = parseInt(text);
    if (isNaN(minutes) || minutes <= 0) {
      return ctx.reply('لطفاً یک عدد مثبت وارد کنید.');
    }
    ctx.session.delayMinutes = minutes;
    ctx.session.step = 'delay_message_buttons';
    ctx.reply('آیا می‌خواهید دکمه اضافه کنید؟', Markup.inlineKeyboard([
      [Markup.button.callback('✅ بله', 'delay_add_buttons')],
      [Markup.button.callback('❌ خیر', 'send_delay_message_now')]
    ]));
  } else if (step === 'poll_question') {
    ctx.session.pollQuestion = text;
    ctx.session.pollOptions = [];
    ctx.session.step = 'poll_options';
    ctx.reply('گزینه اول را وارد کنید:', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'create_poll')]
    ]));
  } else if (step === 'poll_options') {
    if (!ctx.session.pollOptions) ctx.session.pollOptions = [];
    ctx.session.pollOptions.push(text);
    if (ctx.session.pollOptions.length >= 10) {
      const optionsPreview = ctx.session.pollOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n');
      ctx.reply(`حداکثر گزینه‌ها اضافه شد:\n${optionsPreview}`, Markup.inlineKeyboard([
        [Markup.button.callback('✅ ایجاد نظرسنجی', 'create_poll_now')]
      ]));
    } else {
      const optionsPreview = ctx.session.pollOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n');
      ctx.reply(`گزینه اضافه شد:\n${optionsPreview}\nگزینه بعدی را وارد کنید یا دکمه پایان را بزنید:`, Markup.inlineKeyboard([
        [Markup.button.callback('✅ پایان و ایجاد نظرسنجی', 'create_poll_now')]
      ]));
    }
  } else if (step === 'set_welcome_text') {
    const groupId = ctx.session.welcomeGroupId;
    botData.welcomeMessages[groupId] = text;
    saveData();
    ctx.reply('✅ پیام خوشامدگویی تنظیم شد.', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
    ctx.session.step = null;
  } else if (step === 'edit_message_text') {
    ctx.session.newMessageText = text;
    const channelId = ctx.session.editChannelId;
    const messageId = ctx.session.editMessageId;
    bot.telegram.editMessageText(channelId, messageId, null, text, { parse_mode: 'HTML' })
      .then(() => {
        ctx.reply('✅ پیام ویرایش شد.', Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
        ]));
      })
      .catch(err => {
        ctx.reply(`❌ خطا در ویرایش پیام: ${err.message}`, Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
        ]));
      });
    ctx.session.step = null;
  }
});

// ========================
// ارسال پیام با دکمه‌های شیشه‌ای
// ========================
bot.action('send_message', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  ctx.session.step = 'send_message_select_channel';
  const buttons = botData.channels.map(ch => [Markup.button.callback(ch.title, `select_channel:${ch.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/select_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedChannel = ctx.match[1];
  ctx.session.step = 'send_message_text';
  ctx.reply('متن پیام را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'send_message')]
  ]));
});

bot.action('add_buttons', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.step = 'add_button_text';
  ctx.reply('متن دکمه را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('پایان افزودن دکمه', 'send_message_now')],
    [Markup.button.callback('🔙 بازگشت', 'send_message')]
  ]));
});

bot.action('send_message_now', (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.session.selectedChannel;
  const messageText = ctx.session.messageText;
  const buttons = ctx.session.messageButtons || [];
  // ساخت آرایه‌ای از دکمه‌های URL (برای کانال‌ها)
  let inlineKeyboard = [];
  if (buttons.length > 0) {
    for (let i = 0; i < buttons.length; i += 2) {
      let row = [];
      row.push(Markup.button.url(buttons[i].text, buttons[i].url));
      if (buttons[i + 1]) {
        row.push(Markup.button.url(buttons[i + 1].text, buttons[i + 1].url));
      }
      inlineKeyboard.push(row);
    }
  }
  bot.telegram.sendMessage(channelId, messageText, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
  })
    .then(() => {
      ctx.reply('✅ پیام ارسال شد.', Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ]));
      ctx.session = {};
    })
    .catch(err => {
      ctx.reply(`❌ خطا در ارسال پیام: ${err.message}`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ]));
    });
});

// ========================
// ارسال پیام زمانبندی‌شده
// ========================
bot.action('schedule_message', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  ctx.session.step = 'schedule_select_channel';
  const buttons = botData.channels.map(ch => [Markup.button.callback(ch.title, `schedule_channel:${ch.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('کانال مورد نظر برای زمانبندی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/schedule_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedScheduleChannel = ctx.match[1];
  ctx.session.step = 'schedule_message_text';
  ctx.reply('متن پیام زمانبندی را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'schedule_message')]
  ]));
});

bot.action(/schedule_day:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const day = ctx.match[1];
  ctx.session.scheduleDays = ctx.session.scheduleDays || [];
  if (day === 'all') {
    ctx.session.scheduleDays = ['0', '1', '2', '3', '4', '5', '6'];
    ctx.reply('تمام روزها انتخاب شد.');
  } else {
    if (!ctx.session.scheduleDays.includes(day)) {
      ctx.session.scheduleDays.push(day);
      const dayNames = { '0': 'یکشنبه', '1': 'دوشنبه', '2': 'سه‌شنبه', '3': 'چهارشنبه', '4': 'پنجشنبه', '5': 'جمعه', '6': 'شنبه' };
      const selectedDays = ctx.session.scheduleDays.map(d => dayNames[d]).join(', ');
      ctx.reply(`روزهای انتخاب شده: ${selectedDays}`);
    }
  }
});

bot.action('save_schedule', (ctx) => {
  ctx.answerCbQuery();
  if (!ctx.session.scheduleDays || ctx.session.scheduleDays.length === 0) {
    return ctx.reply('لطفاً حداقل یک روز انتخاب کنید.');
  }
  const channelId = ctx.session.selectedScheduleChannel;
  const messageText = ctx.session.scheduleMessageText;
  const time = ctx.session.scheduleTime;
  const days = ctx.session.scheduleDays;
  const [hours, minutes] = ctx.session.scheduleTime.split(':').map(Number);
  
  let cronExpression;
  if (days.length === 7) {
    cronExpression = `${minutes} ${hours} * * *`;
  } else {
    cronExpression = `${minutes} ${hours} * * ${days.join(',')}`;
  }
  
  const scheduleId = Date.now().toString();
  botData.scheduledMessages.push({
    id: scheduleId,
    channelId,
    messageText,
    cronExpression,
    days,
    time
  });
  saveData();
  setupScheduledTasks();
  ctx.reply('✅ پیام زمانبندی ذخیره شد.', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
  ]));
  ctx.session = {};
});

// ========================
// ارسال پیام با تأخیر
// ========================
bot.action('delay_message', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  ctx.session.step = 'delay_select_channel';
  const buttons = botData.channels.map(ch => [Markup.button.callback(ch.title, `delay_channel:${ch.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('کانال مورد نظر برای ارسال پیام با تأخیر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/delay_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedDelayChannel = ctx.match[1];
  ctx.session.step = 'delay_message_text';
  ctx.reply('متن پیام با تأخیر را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'delay_message')]
  ]));
});

bot.action('delay_add_buttons', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.step = 'add_button_text'; // استفاده از همان فرایند افزودن دکمه
  ctx.reply('متن دکمه را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('پایان افزودن دکمه', 'send_delay_message_now')],
    [Markup.button.callback('🔙 بازگشت', 'delay_message')]
  ]));
});

bot.action('send_delay_message_now', (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.session.selectedDelayChannel;
  const messageText = ctx.session.delayMessageText;
  const delayMinutes = ctx.session.delayMinutes;
  const buttons = ctx.session.delayMessageButtons || [];
  let inlineKeyboard = [];
  if (buttons.length > 0) {
    for (let i = 0; i < buttons.length; i += 2) {
      let row = [];
      row.push(Markup.button.url(buttons[i].text, buttons[i].url));
      if (buttons[i + 1]) {
        row.push(Markup.button.url(buttons[i + 1].text, buttons[i + 1].url));
      }
      inlineKeyboard.push(row);
    }
  }
  const delayedMessageId = Date.now().toString();
  botData.delayedMessages.push({
    id: delayedMessageId,
    channelId,
    messageText,
    buttons,
    sendAt: Date.now() + (delayMinutes * 60 * 1000)
  });
  saveData();
  ctx.reply(`✅ پیام با تأخیر ${delayMinutes} دقیقه برنامه‌ریزی شد.`, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
  ]));
  // زمان‌بندی ارسال پیام با استفاده از setTimeout
  setTimeout(async () => {
    try {
      let inlineKeyboardDelayed = [];
      if (buttons.length > 0) {
        for (let i = 0; i < buttons.length; i += 2) {
          let row = [];
          row.push(Markup.button.url(buttons[i].text, buttons[i].url));
          if (buttons[i + 1]) {
            row.push(Markup.button.url(buttons[i + 1].text, buttons[i + 1].url));
          }
          inlineKeyboardDelayed.push(row);
        }
      }
      await bot.telegram.sendMessage(channelId, messageText, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboardDelayed.length > 0 ? { inline_keyboard: inlineKeyboardDelayed } : undefined
      });
      botData.delayedMessages = botData.delayedMessages.filter(msg => msg.id !== delayedMessageId);
      saveData();
    } catch (error) {
      console.error('خطا در ارسال پیام با تأخیر:', error);
    }
  }, delayMinutes * 60 * 1000);
});

// ========================
// ایجاد نظرسنجی
// ========================
bot.action('create_poll', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  ctx.session.step = 'poll_select_channel';
  const buttons = botData.channels.map(ch => [Markup.button.callback(ch.title, `poll_channel:${ch.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('کانال مورد نظر برای نظرسنجی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/poll_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedPollChannel = ctx.match[1];
  ctx.session.step = 'poll_question';
  ctx.reply('سوال نظرسنجی را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'create_poll')]
  ]));
});

bot.action('create_poll_now', (ctx) => {
  ctx.answerCbQuery();
  if (!ctx.session.pollOptions || ctx.session.pollOptions.length < 2) {
    return ctx.reply('نظرسنجی باید حداقل دو گزینه داشته باشد.');
  }
  const channelId = ctx.session.selectedPollChannel;
  const question = ctx.session.pollQuestion;
  const options = ctx.session.pollOptions;
  bot.telegram.sendPoll(channelId, question, options, { is_anonymous: true })
    .then(() => {
      ctx.reply('✅ نظرسنجی ایجاد شد.', Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ]));
      ctx.session = {};
    })
    .catch(err => {
      ctx.reply(`❌ خطا: ${err.message}`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ]));
    });
});

// ========================
// تنظیم پیام خوشامدگویی
// ========================
bot.action('set_welcome', (ctx) => {
  ctx.answerCbQuery();
  // فیلتر کردن گروه‌ها از میان کانال‌ها
  const groups = botData.channels.filter(ch => ch.type === 'group');
  if (groups.length === 0) {
    return ctx.reply('ابتدا یک گروه اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن گروه', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  const buttons = groups.map(gr => [Markup.button.callback(gr.title, `set_welcome_group:${gr.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('گروه مورد نظر برای تنظیم پیام خوشامدگویی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/set_welcome_group:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.welcomeGroupId = ctx.match[1];
  ctx.session.step = 'set_welcome_text';
  const currentWelcome = botData.welcomeMessages[ctx.match[1]] || 'پیام خوشامدگویی تنظیم نشده است';
  ctx.reply(`پیام خوشامدگویی فعلی:\n${currentWelcome}\n\nپیام جدید را وارد کنید (می‌توانید از {user} استفاده کنید):`, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'set_welcome')]
  ]));
});

// ========================
// دریافت اعضای کانال (ادمین‌ها)
// ========================
bot.action('get_members', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  const buttons = botData.channels.map(ch => [Markup.button.callback(ch.title, `get_members_channel:${ch.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/get_members_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.match[1];
  ctx.reply('در حال دریافت اطلاعات اعضا...');
  bot.telegram.getChatAdministrators(channelId)
    .then(admins => {
      if (admins && admins.length > 0) {
        const members = admins.map(adm => {
          const name = adm.user.first_name + (adm.user.last_name ? ' ' + adm.user.last_name : '');
          const username = adm.user.username ? '(@' + adm.user.username + ')' : '';
          return `${name} ${username}`;
        }).join('\n');
        ctx.reply(`ادمین‌های کانال:\n${members}`, Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'get_members')]
        ]));
      } else {
        ctx.reply('اطلاعاتی یافت نشد یا دسترسی کافی ندارید.', Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'get_members')]
        ]));
      }
    })
    .catch(err => {
      ctx.reply(`❌ خطا: ${err.message}`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'get_members')]
      ]));
    });
});

// ========================
// مدیریت پیام‌ها (ویرایش / حذف)
// ========================
bot.action('manage_messages', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('ابتدا کانالی اضافه کنید.', Markup.inlineKeyboard([
      [Markup.button.callback('➕ افزودن کانال', 'add_channel')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ]));
  }
  ctx.session.step = 'manage_message_id';
  const buttons = botData.channels.map(ch => [Markup.button.callback(ch.title, `manage_messages_channel:${ch.id}`)]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);
  ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/manage_messages_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.manageMessageChannelId = ctx.match[1];
  ctx.session.step = 'manage_message_id';
  ctx.reply('لطفاً پیام را فوروارد کنید یا شناسه آن را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
  ]));
});

// دریافت پیام فوروارد شده جهت مدیریت
bot.on('message', (ctx) => {
  if (!isAdmin(ctx)) return;
  if (ctx.session.step === 'manage_message_id' && ctx.message.forward_from_message_id) {
    const messageId = ctx.message.forward_from_message_id;
    const channelId = ctx.session.manageMessageChannelId;
    ctx.reply(`پیام انتخاب شده (ID: ${messageId}). انتخاب کنید:`, Markup.inlineKeyboard([
      [Markup.button.callback('✏️ ویرایش', `edit_message:${channelId}:${messageId}`)],
      [Markup.button.callback('🗑 حذف', `delete_message:${channelId}:${messageId}`)],
      [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
    ]));
  }
});

bot.action(/edit_message:(.+):(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.editChannelId = ctx.match[1];
  ctx.session.editMessageId = ctx.match[2];
  ctx.session.step = 'edit_message_text';
  ctx.reply('متن جدید را وارد کنید:', Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
  ]));
});

bot.action(/delete_message:(.+):(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.match[1];
  const messageId = ctx.match[2];
  bot.telegram.deleteMessage(channelId, messageId)
    .then(() => {
      ctx.reply('✅ پیام حذف شد.', Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
      ]));
    })
    .catch(err => {
      ctx.reply(`❌ خطا در حذف پیام: ${err.message}`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
      ]));
    });
});

// ========================
// دکمه "بازگشت" به منوی اصلی
// ========================
bot.action('back_to_main', (ctx) => {
  ctx.answerCbQuery();
  showAdminPanel(ctx);
});

// ========================
// زمانبندی ارسال پیام‌ها و پردازش پیام‌های با تأخیر
// ========================

// راه‌اندازی وظایف زمانبندی‌شده با استفاده از node-cron
function setupScheduledTasks() {
  // متد cron.getTasks در نسخه‌های مختلف ممکن است وجود نداشته باشد؛ در صورت نیاز می‌توانید مدیریت دستی انجام دهید
  if (cron.getTasks) {
    Object.values(cron.getTasks()).forEach(task => task.stop && task.stop());
  }
  botData.scheduledMessages.forEach(msg => {
    cron.schedule(msg.cronExpression, async () => {
      try {
        await bot.telegram.sendMessage(msg.channelId, msg.messageText, { parse_mode: 'HTML' });
        console.log(`پیام زمانبندی شده به ${msg.channelId} ارسال شد.`);
      } catch (err) {
        console.error('خطا در ارسال پیام زمانبندی شده:', err);
      }
    });
  });
}

// پردازش پیام‌های با تأخیر در زمان راه‌اندازی ربات
function processDelayedMessages() {
  const now = Date.now();
  botData.delayedMessages.forEach(msg => {
    if (msg.sendAt > now) {
      const delay = msg.sendAt - now;
      setTimeout(async () => {
        try {
          let inlineKeyboard = [];
          if (msg.buttons && msg.buttons.length > 0) {
            for (let i = 0; i < msg.buttons.length; i += 2) {
              let row = [];
              row.push(Markup.button.url(msg.buttons[i].text, msg.buttons[i].url));
              if (msg.buttons[i + 1]) {
                row.push(Markup.button.url(msg.buttons[i + 1].text, msg.buttons[i + 1].url));
              }
              inlineKeyboard.push(row);
            }
          }
          await bot.telegram.sendMessage(msg.channelId, msg.messageText, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
          });
          botData.delayedMessages = botData.delayedMessages.filter(m => m.id !== msg.id);
          saveData();
        } catch (err) {
          console.error('خطا در ارسال پیام با تأخیر:', err);
        }
      }, delay);
    } else {
      // حذف پیام‌های منقضی شده
      botData.delayedMessages = botData.delayedMessages.filter(m => m.id !== msg.id);
      saveData();
    }
  });
}

// ========================
// پیام خوشامدگویی برای کاربران جدید در گروه
// ========================
bot.on('new_chat_members', (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (botData.welcomeMessages && botData.welcomeMessages[chatId]) {
    const newMember = ctx.message.new_chat_member;
    let welcomeMsg = botData.welcomeMessages[chatId];
    // جایگزینی {user} با نام کاربر
    welcomeMsg = welcomeMsg.replace('{user}', newMember.first_name);
    ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
  }
});

// ========================
// راه‌اندازی و راه‌اندازی مجدد ربات
// ========================
function initBot() {
  loadData();
  setupScheduledTasks();
  processDelayedMessages();
  bot.launch()
    .then(() => console.log('ربات با موفقیت راه‌اندازی شد.'))
    .catch(err => console.error('خطا در راه‌اندازی ربات:', err));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

initBot();
