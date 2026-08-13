# Гулять вместе

Мобильный сайт для поиска владельцев собак поблизости и организации совместных прогулок.

## Требования

- Node.js 22.13 или новее
- pnpm
- PostgreSQL 16

## Локальный запуск

1. Установите зависимости:

   ```bash
   pnpm install
   ```

2. Запустите PostgreSQL:

   ```bash
   docker run --name postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=testdb \
     -p 5432:5432 \
     -d postgres:16
   ```

3. Создайте локальный файл окружения:

   ```bash
   cp .env.example .env.local
   ```

4. Примените SQL-миграции по порядку:

   ```bash
   for migration in drizzle/*.sql; do
     docker exec -i postgres psql -v ON_ERROR_STOP=1 -U postgres -d testdb < "$migration"
   done
   ```

5. Запустите приложение:

   ```bash
   pnpm dev
   ```

Сайт будет доступен по адресу [http://localhost:3000](http://localhost:3000).

## Проверки

```bash
pnpm lint
pnpm build
```

## Развёртывание на VDS

Production-конфигурация рассчитана на Ubuntu 24.04, Docker Compose, домен
`dogmeet.ru` и PostgreSQL 16. Caddy автоматически получает и обновляет TLS-сертификаты.

1. Установите Docker на сервер и клонируйте репозиторий:

   ```bash
   apt update
   apt install -y ca-certificates curl git
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list
   apt update
   apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   git clone https://github.com/kuzAQA/dogmeetings.git /opt/dogmeet
   cd /opt/dogmeet
   ```

2. Создайте production-окружение. Пароль генерируется в URL-безопасном формате:

   ```bash
   cp .env.production.example .env.production
   sed -i "s/replace_with_a_long_random_hex_password/$(openssl rand -hex 24)/" .env.production
   nano .env.production
   chmod 600 .env.production
   ```

   В `ACME_EMAIL` укажите свой настоящий адрес электронной почты.

3. Убедитесь, что A-записи `dogmeet.ru` и `www.dogmeet.ru` указывают на IP
   сервера, а порты 80 и 443 разрешены в сетевом и системном файрволах.

4. Соберите и запустите сервисы:

   ```bash
   docker compose --env-file .env.production -f compose.production.yml up -d --build
   docker compose --env-file .env.production -f compose.production.yml ps
   docker compose --env-file .env.production -f compose.production.yml logs --tail=100 app caddy
   ```

   SQL-миграции применяются автоматически и повторно не выполняются. После
   успешного запуска сайт будет доступен на [https://dogmeet.ru](https://dogmeet.ru).
   Сервис `scheduler` ежедневно в 06:00 по московскому времени удаляет прогулки,
   у которых дата прогулки меньше текущей даты. Если контейнер был перезапущен
   после 06:00, пропущенная очистка выполняется сразу после запуска.

### Обновление

```bash
cd /opt/dogmeet
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

Проверить работу планировщика можно по его журналу:

```bash
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 scheduler
```

### Резервные копии PostgreSQL

```bash
cd /opt/dogmeet
./scripts/backup.sh
```

Копии сохраняются в `/opt/dogmeet/backups`; файлы старше 14 дней удаляются.
Для ежедневного запуска добавьте в `crontab -e`:

```cron
15 3 * * * cd /opt/dogmeet && ./scripts/backup.sh >> /var/log/dogmeet-backup.log 2>&1
```

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | Строка подключения к PostgreSQL |

Файлы `.env*`, кроме безопасного примера `.env.example`, исключены из Git.

## Безопасная cookie-сессия

При первом открытии сайт создаёт серверную анонимную сессию. В браузере хранится
только случайный `HttpOnly` cookie `dogmeet_session` с атрибутами
`SameSite=Strict`, `Path=/` и `Secure` в production. Срок действия — 400 дней;
он продлевается при каждом открытии сайта. Хеш токена, внутренний идентификатор
пользователя и сохранённая локация находятся в таблице `client_sessions`.

После обновления старые значения `dogwalk.clientId.v1`, `dogwalk.location.v1` и
`dogwalk.hasLocation.v1` один раз переносятся из `localStorage` в серверную
сессию и сразу удаляются из браузера. Обычная работа сайта `localStorage` больше
не использует. Приватные API не принимают `clientId` с фронтенда: владелец
определяется только по cookie-сессии.

## Основные API-маршруты

- `GET /api/locations` — доступные города, районы и жилые комплексы
- `GET /api/health` — готовность приложения и подключение к PostgreSQL
- `GET/POST/PATCH /api/session` — восстановление, создание/продление сессии и сохранение локации
- `GET/POST/PATCH/DELETE /api/pets` — питомцы текущей сессии
- `GET /api/pet-photo` — фотография питомца
- `GET /api/places` — общие места прогулок
- `GET/POST/PATCH/DELETE /api/walks` — прогулки; приватный список: `?scope=mine`

## База данных

Схема описана в `db/schema.ts`. SQL-миграции находятся в каталоге `drizzle` и должны применяться в порядке их номеров.
