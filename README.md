# DevOps Interview Trainer

Локальный React-тренажёр для подготовки к конкретному junior DevOps-собеседованию. Первая версия — компактный, но рабочий вертикальный срез: короткая теория, 24 вопроса, 6 troubleshooting-сценариев, безопасные Linux/Kubernetes-симуляторы и локальный прогресс.

## Запуск

```bash
pnpm install
pnpm dev
```

Проверки:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Состав вертикального среза

- 4 учебных блока: Linux-права; процессы и systemd; сеть/диски; Kubernetes workloads, Service и probes.
- 24 вопроса типов single, multiple, command и open answer.
- 6 лабораторий: permission denied, заполненный диск с удалённым открытым файлом, CrashLoopBackOff, ImagePullBackOff, Pending и Service без endpoints.
- Безопасная виртуальная Linux-среда: `pwd`, `cd`, `ls`, `cat`, `grep`, `find`, `chmod`, `chown`, `stat`, `ps`, `pgrep`, `kill`, `top`, `free`, `df`, `du`, `lsblk`, `ip`, `ss`, `curl`, `systemctl`, `journalctl` и `lsof +L1` для сценария с удалённым файлом.
- Kubernetes-среда: `kubectl get`, `describe`, `logs`, `logs --previous`, `scale`, `delete`, `set image`, `rollout status`, `rollout history`, `rollout undo`.
- Прогресс в `localStorage` через Zustand persist.

## Безопасность

В приложении нет backend, Docker, Kubernetes-кластера или shell-процессов. `src/lib/terminal/commandParser.ts` только разбирает строку, а `LinuxSimulator` и `KubernetesSimulator` читают и меняют собственное виртуальное состояние. Ни `eval`, ни `exec`, ни реальные команды ОС не используются.

## Структура

```text
src/
  components/          # layout, quiz, xterm.js terminal, UI primitives
  data/                # учебный контент и сценарии
  lib/terminal/        # независимые parser, simulators и scenario engine
  pages/               # Dashboard, Modules, Lesson, Quiz, Lab, Progress
  store/               # persisted Zustand progress
  types/               # доменные TypeScript-типы
e2e/                   # Playwright smoke test
```

## Архитектурная граница для будущего backend

UI обращается только к `SafeLabSession`. Позже его можно заменить адаптером настоящего Docker-backend, сохранив контракты `CommandResult` и `ScenarioScore`; в текущей версии эта точка расширения намеренно остаётся локальной и безопасной.
