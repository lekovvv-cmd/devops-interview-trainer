# DevOps Interview Trainer

Локальный тренажёр для подготовки к junior DevOps-собеседованию. Приложение работает без backend, внешних API, Docker и реального Kubernetes-кластера: терминальные команды разбираются и выполняются только над типизированным виртуальным состоянием.

## Что входит

- 10 связанных уроков: 6 по Linux и 4 по Kubernetes.
- 50 вопросов из единого источника данных — в каждом уроке по 2 single-choice, 1 multiple-choice, 1 command и 1 открытому вопросу.
- 10 troubleshooting-сценариев: права, CPU-процесс, systemd, удалённый открытый файл, bind address, CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending и Service без endpoints.
- Guided practice, самостоятельная лаборатория, интервью, карточки повторения и локальное хранение прогресса.
- Версионированный `localStorage` state: несовместимые старые данные безопасно сбрасываются при миграции.

## Запуск

Требуется Node.js 22.14.0 и pnpm 9.15.4 или совместимые версии.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Проверки

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

E2E-тесты самостоятельно собирают production-версию и запускают её на порту `4174`, чтобы не подключаться к случайному dev-серверу.

## Учебные данные и прогресс

`src/data/learning.ts` — каноническая публичная точка учебных данных. Она объединяет описания десяти уроков из `studyLessons.ts` и все вопросы. Dashboard, Modules, Quiz, Progress, Interview и повторение работают с одинаковыми `ModuleId`.

Готовность урока рассчитывается по результатам квиза, самооценке интервью, карточкам, успешно завершённым лабораториям и ручной отметке урока. Ручная отметка имеет вес 10%, поэтому сама по себе не создаёт ложную готовность. Все показатели ограничены диапазоном 0–100%.

## Безопасный терминал

Это не shell и не контейнер. В коде нет `eval`, `exec` и запуска команд операционной системы.

Поддерживаемые Linux-команды в модели: `ls`, `stat`, `cat`, `chmod`, `chown`, `ps`, `pgrep`, `top`, `kill`, `systemctl`, `journalctl`, `df`, `du`, `lsof +L1`, `ss`, `curl`, `ip`, `dig` и ограниченный `trainer edit /etc/app/app.env BIND_ADDRESS=0.0.0.0`.

Поддерживаемые Kubernetes-команды: `kubectl get`, `describe`, `logs`, `logs --previous`, `set image`, `set resources`, `rollout status/history/undo` и безопасно заблокированный `delete pod`.

Симулятор намеренно реализует только команды и объекты, нужные сценариям. Не стоит использовать его как справочник полной POSIX-shell или Kubernetes CLI.

## Проверка сценариев

`ScenarioEngine` сохраняет последовательный журнал действий: исходную и разобранную команду, объект, аргументы, диагностические теги, изменение виртуального состояния и опасность действия. Для полного зачёта нужны:

1. симптом;
2. диагностика конкретной причины;
3. безопасное исправление после диагностики;
4. повторная проверка результата.

Опасные действия (`chmod 777`, `kill -9` до SIGTERM, удаление Pod до логов, reboot и т. п.) не засчитываются как решение и снижают оценку.

## Структура

```text
src/
  data/learning.ts          # единый публичный источник уроков и вопросов
  data/studyLessons.ts      # содержание 10 уроков
  data/scenarios.ts         # 10 troubleshooting-сценариев
  lib/terminal/             # parser, Linux/Kubernetes simulators, ScenarioEngine
  lib/progress.ts           # расчёт прогресса и слабых тем
  pages/                    # существующие экраны приложения
  store/progressStore.ts    # versioned localStorage state
e2e/                        # Playwright Chromium flows
.github/workflows/ci.yml    # CI
```
