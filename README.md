# AmiGo

AmiGo это веб-приложение для поиска друзей и прямого общения по `AmiGo ID`, каталогу пользователей и личным чатам на `Supabase`.

## Что внутри

- `app/auth/page.tsx` - вход и регистрация по `email + password`
- `app/profile/page.tsx` - профиль пользователя и AmiGo ID
- `app/discover/page.tsx` - каталог людей и добавление в друзья
- `app/friends/page.tsx` - список друзей из базы
- `app/chats/[chatId]/page.tsx` - realtime-чат
- `lib/supabase/client.ts` - браузерный клиент Supabase
- `lib/supabase/queries.ts` - запросы к профилям, друзьям и сообщениям
- `supabase/schema.sql` - SQL-схема таблиц и RLS-политик

## Настройка

1. Создай проект в Supabase.
2. В `SQL Editor` выполни содержимое `supabase/schema.sql`.
3. В `Authentication > Providers` оставь `Email` включенным.
4. В `Database > Replication` убедись, что таблица `messages` включена в Realtime.
5. Создай файл `.env.local` на основе `.env.example`.

Пример `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

## Локальный запуск

```powershell
cd C:\Users\Petr\Documents\AmiGo
$env:PATH='C:\Program Files\nodejs;' + $env:PATH
npm.cmd install
npm.cmd run dev
```

Для открытия с телефона в той же сети:

```powershell
cd C:\Users\Petr\Documents\AmiGo
$env:PATH='C:\Program Files\nodejs;' + $env:PATH
npm.cmd run dev -- --hostname 0.0.0.0 --port 3000
```

## Публикация

Самый простой путь сейчас это `Vercel`.

1. Залей проект в GitHub.
2. Импортируй репозиторий в Vercel.
3. В `Project Settings > Environment Variables` добавь:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Запусти первый deploy.
5. После публикации проверь регистрацию, сохранение профиля, добавление в друзья и чат.

После этого можно подключить свой домен в настройках проекта на Vercel.

Актуальные официальные инструкции:

- Next.js deployment: [nextjs.org/docs/app/building-your-application/deploying](https://nextjs.org/docs/app/building-your-application/deploying)
- Deploy Next.js on Vercel: [vercel.com/docs/frameworks/full-stack/nextjs](https://vercel.com/docs/frameworks/full-stack/nextjs)
- Vercel environment variables: [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables)

## APK для Android

Проект уже подготовлен под Android через `Capacitor`.

Важно:

- текущая Android-версия открывает прод-сайт `https://ami-go-01.vercel.app` внутри приложения;
- это быстрый путь к APK без переписывания всего фронтенда;
- если сайт без VPN недоступен, APK тоже будет упираться в тот же адрес.

Основные файлы:

- `capacitor.config.ts`
- `android/`

Команды:

```powershell
cd C:\Users\Petr\Documents\AmiGo
npm.cmd run android:sync
npm.cmd run android:open
```

Дальше в `Android Studio`:

1. дождаться Gradle Sync
2. выбрать `Build > Build Bundle(s) / APK(s) > Build APK(s)`
3. забрать готовый `.apk` из Android Studio

Если позже захотим более нативную сборку, можно будет:

1. перевести часть функций на Capacitor plugins
2. добавить push-уведомления
3. сделать локальные Android splash/icon
4. уйти с remote URL на встроенную web-сборку или другой хостинг

## Что проверить после релиза

1. Регистрация нового пользователя.
2. Сохранение профиля в базе.
3. Поиск по `AmiGo ID`.
4. Добавление в друзья.
5. Отправка и получение сообщений между двумя аккаунтами.

## Следующие шаги

1. Добавить заявки в друзья вместо мгновенного добавления.
2. Подключить загрузку фото в Supabase Storage.
3. Сделать online-статусы и unread counters.
4. Добавить блокировки, жалобы и модерацию.
