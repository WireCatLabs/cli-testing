import { checkPortal } from "../portal-check.mjs"

const [base, output, source, release] = process.argv.slice(2)
await checkPortal({
  base,
  output,
  source,
  release,
  markers: {
    recipes: {
      en: [
        "document URLs added by edits to older stored messages",
        "messenger tool must first save the edited message locally",
        "tg personal chats documents list CHAT_ID",
      ],
      ru: [
        "Google-ссылки, добавленные при редактировании старых сохранённых сообщений",
        "должен сначала сохранить отредактированное сообщение локально",
        "tg personal chats documents list CHAT_ID",
      ],
      es: [
        "URL de documentos añadidas al editar mensajes antiguos guardados",
        "debe guardar primero el mensaje editado localmente",
        "tg personal chats documents list CHAT_ID",
      ],
    },
    changelog: [
      release,
      "edits to previously stored messages",
      "first sync with the new linker repairs earlier missed message links",
    ],
  },
})
