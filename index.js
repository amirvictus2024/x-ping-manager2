const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const cron = require('node-cron');

// تنظیمات اولیه
const BOT_TOKEN = '8069263840:AAF2JTFJl6cfo7z1rU_CegYnCNJH6bLXcg0'; // توکن ربات (ثابت در کد)
const ADMIN_ID = 6712954701; // آی‌دی ادمین
const DATA_FILE = 'bot_data.json';

// ساختار داده‌های ربات
let botData = {
  scheduledMessages: [],
  welcomeMessages: {},
  channels: [],
  delayedMessages: []
};

// بارگذاری اطلاعات از فایل
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      botData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
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
bot.use(session());

// پنل مدیریت اصلی (چیدمان ۲ ستونه)
function showAdminPanel(ctx) {
  ctx.reply('🖥 پنل مدیریت:', Markup.inlineKeyboard([
    [
      Markup.button.callback('📝 پیام', 'send_message'),
      Markup.button.callback('⏱ زمانبندی', 'schedule_message')
    ],
    [
      Markup.button.callback('⏲ تأخیر', 'delay_message'),
      Markup.button.callback('📊 نظرسنجی', 'create_poll')
    ],
    [
      Markup.button.callback('👋 خوشامد', 'set_welcome'),
      Markup.button.callback('👥 اعضا', 'get_members')
    ],
    [
      Markup.button.callback('📺 کانال‌ها', 'manage_channels'),
      Markup.button.callback('🔄 پیام‌ها', 'manage_messages')
    ]
  ]));
}

// دستور /start
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

// محدودسازی دسترسی (برای callbackها و پیام‌ها)
bot.use((ctx, next) => {
  if ((ctx.callbackQuery || ctx.updateType === 'message') && !isAdmin(ctx)) {
    return ctx.reply('⛔️ شما دسترسی به این بخش را ندارید.');
  }
  return next();
});


// ========================
// مدیریت کانال‌ها
// ========================

// نمایش کانال‌ها به صورت دو ستونه
bot.action('manage_channels', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('کانالی موجود نیست. لطفاً یک کانال اضافه کنید.');
  }
  // چیدمان ۲ ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `channel_info:${botData.channels[i].id}`)
    ];
    if (botData.channels[i + 1])
      row.push(Markup.button.callback(botData.channels[i + 1].title, `channel_info:${botData.channels[i + 1].id}`));
    buttons.push(row);
  }
  // دکمه افزودن کانال در بالای صفحه
  buttons.unshift([Markup.button.callback('➕ افزودن کانال', 'add_channel')]);
  ctx.reply('کانال‌ها:', Markup.inlineKeyboard(buttons));
});

// افزودن کانال (دکمه "افزودن کانال" فعال می‌شود)
bot.action('add_channel', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.step = 'add_channel_username';
  ctx.reply('لطفاً نام کاربری کانال (با @) یا شناسه عددی را وارد کنید:');
});

// دریافت ورودی متنی برای افزودن کانال
bot.on('text', (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.trim();
  const step = ctx.session.step;

  if (step === 'add_channel_username') {
    if (botData.channels.find(ch => ch.id === text)) {
      ctx.reply('این کانال قبلاً اضافه شده است.');
      ctx.session.step = null;
      return;
    }
    ctx.session.newChannelId = text;
    ctx.session.step = 'add_channel_title';
    ctx.reply('نام نمایشی کانال را وارد کنید:');
  } else if (step === 'add_channel_title') {
    const newChannel = {
      id: ctx.session.newChannelId,
      title: text,
      type: ctx.session.newChannelId.startsWith('@') ? 'channel' : 'group'
    };
    botData.channels.push(newChannel);
    saveData();
    ctx.reply(`✅ کانال "${newChannel.title}" اضافه شد.`);
    ctx.session.step = null;
  }
  // سایر مراحل دریافت متن (ارسال پیام، زمانبندی و غیره) در ادامه کد آمده‌اند...
  
  else if (step === 'send_message_text') {
    ctx.session.messageText = text;
    ctx.session.step = 'send_message_buttons';
    ctx.reply('آیا می‌خواهید دکمه اضافه کنید؟\nدر صورت نیاز می‌توانید دکمه‌های چندتایی اضافه کنید.', 
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ بله', 'add_buttons'), Markup.button.callback('❌ خیر', 'send_message_now')]
      ])
    );
  } else if (step === 'add_button_text') {
    ctx.session.currentButtonText = text;
    ctx.session.step = 'add_button_url';
    ctx.reply('لینک دکمه را وارد کنید:');
  } else if (step === 'add_button_url') {
    if (!ctx.session.messageButtons) ctx.session.messageButtons = [];
    ctx.session.messageButtons.push({ text: ctx.session.currentButtonText, url: text });
    const preview = ctx.session.messageButtons.map(btn => `[${btn.text}](${btn.url})`).join('\n');
    ctx.reply(`دکمه اضافه شد:\n${preview}\nبرای افزودن دکمه دیگر، مجدداً دکمه "✅ بله" را بزنید یا برای ارسال پیام "❌ خیر" را انتخاب کنید.`, { parse_mode: 'Markdown' });
    ctx.session.step = 'send_message_buttons';
  }
  else if (step === 'schedule_message_text') {
    ctx.session.scheduleMessageText = text;
    ctx.session.step = 'schedule_message_time';
    ctx.reply('زمان ارسال را به فرمت HH:MM وارد کنید (مثلاً 14:30):');
  }
  else if (step === 'schedule_message_time') {
    if (!/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(text)) {
      return ctx.reply('فرمت زمان اشتباه است. لطفاً به صورت HH:MM وارد کنید.');
    }
    ctx.session.scheduleTime = text;
    ctx.session.step = 'schedule_message_days';
    ctx.reply('روزهای ارسال را انتخاب کنید. (برای انتخاب همه، دکمه "هر روز" را بزنید)');
  }
  else if (step === 'delay_message_text') {
    ctx.session.delayMessageText = text;
    ctx.session.step = 'delay_message_minutes';
    ctx.reply('تعداد دقیقه تأخیر را وارد کنید (مثلاً 10):');
  }
  else if (step === 'delay_message_minutes') {
    const minutes = parseInt(text);
    if (isNaN(minutes) || minutes <= 0) {
      return ctx.reply('لطفاً یک عدد مثبت وارد کنید.');
    }
    ctx.session.delayMinutes = minutes;
    ctx.session.step = 'delay_message_buttons';
    ctx.reply('آیا می‌خواهید دکمه به پیام اضافه شود؟ (در صورت نیاز)', 
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ بله', 'delay_add_buttons'), Markup.button.callback('❌ خیر', 'send_delay_message_now')]
      ])
    );
  }
  else if (step === 'poll_question') {
    ctx.session.pollQuestion = text;
    ctx.session.pollOptions = [];
    ctx.session.step = 'poll_options';
    ctx.reply('گزینه اول نظرسنجی را وارد کنید:');
  }
  else if (step === 'poll_options') {
    if (!ctx.session.pollOptions) ctx.session.pollOptions = [];
    ctx.session.pollOptions.push(text);
    if (ctx.session.pollOptions.length >= 10) {
      const preview = ctx.session.pollOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n');
      ctx.reply(`حداکثر گزینه‌ها اضافه شد:\n${preview}`);
    } else {
      const preview = ctx.session.pollOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n');
      ctx.reply(`گزینه اضافه شد:\n${preview}\nگزینه بعدی را وارد کنید یا دکمه "پایان" را بزنید.`);
    }
  }
  else if (step === 'set_welcome_text') {
    const groupId = ctx.session.welcomeGroupId;
    botData.welcomeMessages[groupId] = text;
    saveData();
    ctx.reply('✅ پیام خوشامدگویی تنظیم شد.');
    ctx.session.step = null;
  }
  else if (step === 'edit_message_text') {
    ctx.session.newMessageText = text;
    const channelId = ctx.session.editChannelId;
    const messageId = ctx.session.editMessageId;
    bot.telegram.editMessageText(channelId, messageId, null, text, { parse_mode: 'HTML' })
      .then(() => ctx.reply('✅ پیام ویرایش شد.'))
      .catch(err => ctx.reply(`❌ خطا: ${err.message}`));
    ctx.session.step = null;
  }
});

// ========================
// ارسال پیام به کانال با دکمه‌های شیشه‌ای
// ========================
bot.action('send_message', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('کانالی موجود نیست. ابتدا یک کانال اضافه کنید.');
  }
  // نمایش کانال‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `select_channel:${botData.channels[i].id}`)
    ];
    if (botData.channels[i + 1])
      row.push(Markup.button.callback(botData.channels[i + 1].title, `select_channel:${botData.channels[i + 1].id}`));
    buttons.push(row);
  }
  ctx.session.step = 'send_message_select_channel';
  ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/select_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedChannel = ctx.match[1];
  ctx.session.step = 'send_message_text';
  ctx.reply('متن پیام را وارد کنید:');
});

bot.action('add_buttons', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.step = 'add_button_text';
  ctx.reply('متن دکمه را وارد کنید:');
});

bot.action('send_message_now', (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.session.selectedChannel;
  const messageText = ctx.session.messageText;
  const buttons = ctx.session.messageButtons || [];
  let inlineKeyboard = [];
  if (buttons.length > 0) {
    // گروه‌بندی دکمه‌ها به صورت دو ستونه
    for (let i = 0; i < buttons.length; i += 2) {
      let row = [Markup.button.url(buttons[i].text, buttons[i].url)];
      if (buttons[i + 1])
        row.push(Markup.button.url(buttons[i + 1].text, buttons[i + 1].url));
      inlineKeyboard.push(row);
    }
  }
  bot.telegram.sendMessage(channelId, messageText, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined
  })
  .then(() => {
    ctx.reply('✅ پیام ارسال شد.');
    ctx.session = {};
  })
  .catch(err => ctx.reply(`❌ خطا: ${err.message}`));
});

// ========================
// زمانبندی پیام
// ========================
bot.action('schedule_message', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('کانالی موجود نیست. ابتدا یک کانال اضافه کنید.');
  }
  // نمایش کانال‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `schedule_channel:${botData.channels[i].id}`)
    ];
    if (botData.channels[i + 1])
      row.push(Markup.button.callback(botData.channels[i + 1].title, `schedule_channel:${botData.channels[i + 1].id}`));
    buttons.push(row);
  }
  ctx.session.step = 'schedule_select_channel';
  ctx.reply('کانال مورد نظر برای زمانبندی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/schedule_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedScheduleChannel = ctx.match[1];
  ctx.session.step = 'schedule_message_text';
  ctx.reply('متن پیام زمانبندی را وارد کنید:');
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
  const [hours, minutes] = time.split(':').map(Number);
  
  let cronExpression;
  if (days.length === 7) {
    cronExpression = `${minutes} ${hours} * * *`;
  } else {
    cronExpression = `${minutes} ${hours} * * ${days.join(',')}`;
  }
  
  botData.scheduledMessages.push({
    id: Date.now().toString(),
    channelId,
    messageText,
    cronExpression,
    days,
    time
  });
  saveData();
  setupScheduledTasks();
  ctx.reply('✅ پیام زمانبندی ذخیره شد.');
  ctx.session = {};
});

// انتخاب روز برای زمانبندی (متن ساده)
bot.action(/schedule_day:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const day = ctx.match[1];
  ctx.session.scheduleDays = ctx.session.scheduleDays || [];
  if (day === 'all') {
    ctx.session.scheduleDays = ['0','1','2','3','4','5','6'];
    ctx.reply('تمام روزها انتخاب شد.');
  } else if (!ctx.session.scheduleDays.includes(day)) {
    ctx.session.scheduleDays.push(day);
    ctx.reply(`روز انتخاب شده ثبت شد.`);
  }
});

// ========================
// ارسال پیام با تأخیر
// ========================
bot.action('delay_message', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('کانالی موجود نیست. ابتدا یک کانال اضافه کنید.');
  }
  // نمایش کانال‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `delay_channel:${botData.channels[i].id}`)
    ];
    if (botData.channels[i + 1])
      row.push(Markup.button.callback(botData.channels[i + 1].title, `delay_channel:${botData.channels[i + 1].id}`));
    buttons.push(row);
  }
  ctx.session.step = 'delay_select_channel';
  ctx.reply('کانال مورد نظر برای ارسال پیام با تأخیر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/delay_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedDelayChannel = ctx.match[1];
  ctx.session.step = 'delay_message_text';
  ctx.reply('متن پیام با تأخیر را وارد کنید:');
});

bot.action('delay_add_buttons', (ctx) => {
  ctx.answerCbQuery();
  ctx.session.step = 'add_button_text';
  ctx.reply('متن دکمه را وارد کنید:');
});

bot.action('send_delay_message_now', (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.session.selectedDelayChannel;
  const messageText = ctx.session.delayMessageText;
  const delayMinutes = ctx.session.delayMinutes;
  const buttons = ctx.session.delayMessageButtons || [];
  let inlineKeyboard = [];
  if (buttons.length) {
    for (let i = 0; i < buttons.length; i += 2) {
      let row = [Markup.button.url(buttons[i].text, buttons[i].url)];
      if (buttons[i+1]) row.push(Markup.button.url(buttons[i+1].text, buttons[i+1].url));
      inlineKeyboard.push(row);
    }
  }
  const delayedMessageId = Date.now().toString();
  botData.delayedMessages.push({
    id: delayedMessageId,
    channelId,
    messageText,
    buttons,
    sendAt: Date.now() + delayMinutes * 60 * 1000
  });
  saveData();
  ctx.reply(`✅ پیام با تأخیر ${delayMinutes} دقیقه برنامه‌ریزی شد.`);
  setTimeout(async () => {
    try {
      await bot.telegram.sendMessage(channelId, messageText, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined
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
    return ctx.reply('کانالی موجود نیست. ابتدا یک کانال اضافه کنید.');
  }
  // نمایش کانال‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `poll_channel:${botData.channels[i].id}`)
    ];
    if (botData.channels[i + 1])
      row.push(Markup.button.callback(botData.channels[i + 1].title, `poll_channel:${botData.channels[i + 1].id}`));
    buttons.push(row);
  }
  ctx.session.step = 'poll_select_channel';
  ctx.reply('کانال نظرسنجی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/poll_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.selectedPollChannel = ctx.match[1];
  ctx.session.step = 'poll_question';
  ctx.reply('سوال نظرسنجی را وارد کنید:');
});

bot.action('create_poll_now', (ctx) => {
  ctx.answerCbQuery();
  if (!ctx.session.pollOptions || ctx.session.pollOptions.length < 2) {
    return ctx.reply('برای نظرسنجی حداقل دو گزینه نیاز است.');
  }
  const channelId = ctx.session.selectedPollChannel;
  const question = ctx.session.pollQuestion;
  const options = ctx.session.pollOptions;
  bot.telegram.sendPoll(channelId, question, options, { is_anonymous: true })
    .then(() => {
      ctx.reply('✅ نظرسنجی ایجاد شد.');
      ctx.session = {};
    })
    .catch(err => ctx.reply(`❌ خطا: ${err.message}`));
});

// ========================
// تنظیم پیام خوشامدگویی در گروه
// ========================
bot.action('set_welcome', (ctx) => {
  ctx.answerCbQuery();
  const groups = botData.channels.filter(ch => ch.type === 'group');
  if (!groups.length) {
    return ctx.reply('هیچ گروهی موجود نیست. لطفاً ابتدا گروه اضافه کنید.');
  }
  // نمایش گروه‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < groups.length; i += 2) {
    const row = [
      Markup.button.callback(groups[i].title, `set_welcome_group:${groups[i].id}`)
    ];
    if (groups[i+1])
      row.push(Markup.button.callback(groups[i+1].title, `set_welcome_group:${groups[i+1].id}`));
    buttons.push(row);
  }
  ctx.reply('گروه مورد نظر برای خوشامدگویی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/set_welcome_group:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.welcomeGroupId = ctx.match[1];
  ctx.session.step = 'set_welcome_text';
  const current = botData.welcomeMessages[ctx.match[1]] || 'پیامی تنظیم نشده است.';
  ctx.reply(`پیام خوشامدگویی فعلی:\n${current}\n\nپیام جدید را وارد کنید (می‌توانید از {user} استفاده کنید):`);
});

// ========================
// دریافت اعضای کانال (ادمین‌ها)
// ========================
bot.action('get_members', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('کانالی موجود نیست. ابتدا یک کانال اضافه کنید.');
  }
  // نمایش کانال‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `get_members_channel:${botData.channels[i].id}`)
    ];
    if (botData.channels[i+1])
      row.push(Markup.button.callback(botData.channels[i+1].title, `get_members_channel:${botData.channels[i+1].id}`));
    buttons.push(row);
  }
  ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/get_members_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.match[1];
  ctx.reply('در حال دریافت اطلاعات اعضا...');
  bot.telegram.getChatAdministrators(channelId)
    .then(admins => {
      if (admins && admins.length) {
        const members = admins.map(a => {
          const name = a.user.first_name + (a.user.last_name ? ' ' + a.user.last_name : '');
          const uname = a.user.username ? `(@${a.user.username})` : '';
          return `${name} ${uname}`;
        }).join('\n');
        ctx.reply(`ادمین‌های کانال:\n${members}`);
      } else {
        ctx.reply('اطلاعاتی یافت نشد یا دسترسی کافی ندارید.');
      }
    })
    .catch(err => ctx.reply(`❌ خطا: ${err.message}`));
});

// ========================
// مدیریت پیام‌ها (ویرایش / حذف)
// ========================
bot.action('manage_messages', (ctx) => {
  ctx.answerCbQuery();
  if (botData.channels.length === 0) {
    return ctx.reply('کانالی موجود نیست. ابتدا یک کانال اضافه کنید.');
  }
  // نمایش کانال‌ها به صورت دو ستونه
  const buttons = [];
  for (let i = 0; i < botData.channels.length; i += 2) {
    const row = [
      Markup.button.callback(botData.channels[i].title, `manage_messages_channel:${botData.channels[i].id}`)
    ];
    if (botData.channels[i+1])
      row.push(Markup.button.callback(botData.channels[i+1].title, `manage_messages_channel:${botData.channels[i+1].id}`));
    buttons.push(row);
  }
  ctx.session.step = 'manage_message_id';
  ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
});

bot.action(/manage_messages_channel:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.manageMessageChannelId = ctx.match[1];
  ctx.reply('لطفاً پیام را فوروارد کنید یا شناسه آن را وارد کنید:');
});

bot.on('message', (ctx) => {
  if (!isAdmin(ctx)) return;
  if (ctx.session.step === 'manage_message_id' && ctx.message.forward_from_message_id) {
    const messageId = ctx.message.forward_from_message_id;
    const channelId = ctx.session.manageMessageChannelId;
    ctx.reply(`پیام انتخاب شده (ID: ${messageId}). انتخاب کنید:`, Markup.inlineKeyboard([
      [Markup.button.callback('✏️ ویرایش', `edit_message:${channelId}:${messageId}`)],
      [Markup.button.callback('🗑 حذف', `delete_message:${channelId}:${messageId}`)]
    ]));
  }
});

bot.action(/edit_message:(.+):(.+)/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.editChannelId = ctx.match[1];
  ctx.session.editMessageId = ctx.match[2];
  ctx.session.step = 'edit_message_text';
  ctx.reply('متن جدید را وارد کنید:');
});

bot.action(/delete_message:(.+):(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const channelId = ctx.match[1];
  const messageId = ctx.match[2];
  bot.telegram.deleteMessage(channelId, messageId)
    .then(() => ctx.reply('✅ پیام حذف شد.'))
    .catch(err => ctx.reply(`❌ خطا: ${err.message}`));
});

// ========================
// راه‌اندازی وظایف زمانبندی‌شده و پیام‌های تأخیری
// ========================
function setupScheduledTasks() {
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

function processDelayedMessages() {
  const now = Date.now();
  botData.delayedMessages.forEach(msg => {
    if (msg.sendAt > now) {
      const delay = msg.sendAt - now;
      setTimeout(async () => {
        try {
          let inlineKeyboard = [];
          if (msg.buttons && msg.buttons.length) {
            for (let i = 0; i < msg.buttons.length; i += 2) {
              let row = [Markup.button.url(msg.buttons[i].text, msg.buttons[i].url)];
              if (msg.buttons[i+1]) row.push(Markup.button.url(msg.buttons[i+1].text, msg.buttons[i+1].url));
              inlineKeyboard.push(row);
            }
          }
          await bot.telegram.sendMessage(msg.channelId, msg.messageText, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined
          });
          botData.delayedMessages = botData.delayedMessages.filter(m => m.id !== msg.id);
          saveData();
        } catch (err) {
          console.error('خطا در ارسال پیام تأخیری:', err);
        }
      }, delay);
    } else {
      botData.delayedMessages = botData.delayedMessages.filter(m => m.id !== msg.id);
      saveData();
    }
  });
}

// ========================
// پیام خوشامدگویی در گروه
// ========================
bot.on('new_chat_members', (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (botData.welcomeMessages && botData.welcomeMessages[chatId]) {
    const newMember = ctx.message.new_chat_member;
    let welcomeMsg = botData.welcomeMessages[chatId];
    welcomeMsg = welcomeMsg.replace('{user}', newMember.first_name);
    ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
  }
});

// ========================
// راه‌اندازی ربات
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
