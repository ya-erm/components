# Инструкция по настройке S3 бакета в Yandex Cloud

1. Проинициализировать `yc`, залогиниться, выбрать облака и каталог в нём
   ```
   yc init
   ```
2. Создать S3 бакет
3. Создать сервисный аккаунт
4. Создать статичный ключ доступа
   - Выполнить команду
     ```sh
     yc iam access-key create --service-account-id ИДЕНТИФИКАТОР_СЕРВИСНОГО_АККАУНТА --format json
     ```
   - Заполнить переменные окружения: `access_key.key_id` записать в `S3_ACCESS_KEY_ID`, `secret` - в `S3_SECRET_ACCESS_KEY`
5. Настроить политику доступа к бакету
   - Создать `yc-bucket-policy.json` на основе `yc-bucket-policy.example.json`, заполнив в нём название бакета, идентификаторы пользователя и сервисного аккаунта
   - Выполнить команду
     ```
     yc storage bucket update --name ИМЯ_ВАШЕГО_БАКЕТА --policy-from-file infra/yc-bucket-policy.json
     ```
