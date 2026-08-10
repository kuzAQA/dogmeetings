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

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | Строка подключения к PostgreSQL |

Файлы `.env*`, кроме безопасного примера `.env.example`, исключены из Git.

## Основные API-маршруты

- `GET /api/locations` — доступные города, районы и жилые комплексы
- `GET/POST/DELETE /api/pets` — питомцы пользователя
- `GET /api/pet-photo` — фотография питомца
- `GET /api/places` — общие места прогулок
- `GET/POST/DELETE /api/walks` — прогулки

## База данных

Схема описана в `db/schema.ts`. SQL-миграции находятся в каталоге `drizzle` и должны применяться в порядке их номеров.
