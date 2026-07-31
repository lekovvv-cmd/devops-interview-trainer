import type { ModuleId, QuizQuestion } from '../types/domain'
export { lessonById, lessonCycle, lessonPlans, studyLessons, type StudyLesson } from './studyLessons'

type Option = readonly [string, string]
type LessonQuizSpec = {
  lessonId: ModuleId
  singles: readonly [{ prompt: string; options: readonly Option[]; correct: string; explanation: string }, { prompt: string; options: readonly Option[]; correct: string; explanation: string }]
  multiple: { prompt: string; options: readonly Option[]; correct: readonly string[]; explanation: string }
  command: { prompt: string; acceptedAnswers: string[]; explanation: string }
  open: { prompt: string; referenceAnswer: string; explanation: string }
}

const option = ([id, label]: Option) => ({ id, label })
const buildQuestions = (spec: LessonQuizSpec): QuizQuestion[] => [
  ...spec.singles.map((item, index) => ({ id: `${spec.lessonId}-single-${index + 1}`, lessonId: spec.lessonId, kind: 'single' as const, prompt: item.prompt, options: item.options.map(option), correctOptionIds: [item.correct], explanation: item.explanation })),
  { id: `${spec.lessonId}-multiple-1`, lessonId: spec.lessonId, kind: 'multiple' as const, prompt: spec.multiple.prompt, options: spec.multiple.options.map(option), correctOptionIds: [...spec.multiple.correct], explanation: spec.multiple.explanation },
  { id: `${spec.lessonId}-command-1`, lessonId: spec.lessonId, kind: 'command' as const, prompt: spec.command.prompt, acceptedAnswers: spec.command.acceptedAnswers, explanation: spec.command.explanation },
  { id: `${spec.lessonId}-open-1`, lessonId: spec.lessonId, kind: 'open' as const, prompt: spec.open.prompt, referenceAnswer: spec.open.referenceAnswer, explanation: spec.open.explanation },
]

const specs: LessonQuizSpec[] = [
  {
    lessonId: 'linux-permissions',
    singles: [
      { prompt: 'Что означает режим 640 для обычного файла?', options: [['a', 'Владелец rw-, группа r--, остальные ---'], ['b', 'Владелец rwx, группа r--, остальные ---'], ['c', 'Владелец rw-, группа rw-, остальные ---']], correct: 'a', explanation: '6 = rw-, 4 = r--, 0 = ---.' },
      { prompt: 'Какое право необходимо пользователю для прохода через каталог?', options: [['a', 'r'], ['b', 'w'], ['c', 'x']], correct: 'c', explanation: 'x на каталоге разрешает traversal: обратиться к объекту по известному имени.' },
    ],
    multiple: { prompt: 'Что безопасно проверить перед изменением прав при Permission denied?', options: [['a', 'Владельца и группу файла'], ['b', 'Режим файла'], ['c', 'Права каталогов по пути'], ['d', 'Сразу выполнить chmod 777']], correct: ['a', 'b', 'c'], explanation: 'Причину ищут по владельцу, группе, режимам файла и каталогов пути; 777 не является диагностикой.' },
    command: { prompt: 'Передайте конфигурацию сервисному пользователю app.', acceptedAnswers: ['chown app:app /srv/app/config.yml'], explanation: 'chown app:app меняет владельца и группу только указанного виртуального файла.' },
    open: { prompt: 'Почему umask 027 обычно даёт новому обычному файлу режим 640?', referenceAnswer: 'Базовый режим обычного файла обычно 666. umask запрещает отдельные биты побитово, а не вычитается как обычное число. Маска 027 запрещает группе запись и остальным все права, поэтому итог обычно 640.', explanation: 'Нужны база 666, побитовая маска и результат 640.' },
  },
  {
    lessonId: 'linux-processes',
    singles: [
      { prompt: 'Что показывает PPID процесса?', options: [['a', 'Идентификатор родительского процесса'], ['b', 'Потребление памяти'], ['c', 'Открытый порт']], correct: 'a', explanation: 'PPID связывает процесс с его родителем в дереве процессов.' },
      { prompt: 'Какой сигнал стоит попробовать первым для корректного завершения процесса?', options: [['a', 'SIGKILL'], ['b', 'SIGTERM'], ['c', 'SIGSTOP']], correct: 'b', explanation: 'SIGTERM можно обработать и завершить cleanup; SIGKILL — последний шаг.' },
    ],
    multiple: { prompt: 'Какие сигналы процесс не может перехватить или проигнорировать?', options: [['a', 'SIGKILL'], ['b', 'SIGSTOP'], ['c', 'SIGTERM'], ['d', 'SIGHUP']], correct: ['a', 'b'], explanation: 'SIGKILL и SIGSTOP применяются ядром без пользовательского обработчика.' },
    command: { prompt: 'Покажите PID, PPID, состояние и команду процесса 3912.', acceptedAnswers: ['ps -o pid,ppid,stat,cmd -p 3912'], explanation: 'Эта команда даёт контекст перед отправкой сигнала.' },
    open: { prompt: 'Что такое zombie-процесс и что проверять при его появлении?', referenceAnswer: 'Zombie уже завершился, но его родитель ещё не прочитал статус завершения через wait. Сам zombie почти не потребляет ресурсы; проверять и исправлять нужно родительский процесс.', explanation: 'В ответе важны завершение дочернего процесса и роль родителя.' },
  },
  {
    lessonId: 'linux-systemd',
    singles: [
      { prompt: 'Что обязательно сделать после изменения unit-файла?', options: [['a', 'systemctl daemon-reload'], ['b', 'kill -9 systemd'], ['c', 'df -i']], correct: 'a', explanation: 'daemon-reload заставляет systemd перечитать unit-файлы.' },
      { prompt: 'Где искать конкретную причину failed unit?', options: [['a', 'В journalctl -u unit'], ['b', 'Только в top'], ['c', 'В имени сервиса']], correct: 'a', explanation: 'status даёт сводку, а journalctl хранит события и stderr запуска.' },
    ],
    multiple: { prompt: 'Какие утверждения о systemd верны?', options: [['a', 'restart перезапускает процесс'], ['b', 'reload зависит от поддержки приложения'], ['c', 'enable включает старт при загрузке'], ['d', 'daemon-reload равен restart']], correct: ['a', 'b', 'c'], explanation: 'daemon-reload перечитывает описания unit и не запускает сервис сам по себе.' },
    command: { prompt: 'Покажите последние 30 строк журнала app-worker без pager.', acceptedAnswers: ['journalctl -u app-worker -n 30 --no-pager', 'journalctl -n 30 -u app-worker --no-pager'], explanation: 'Фильтр -u выбирает unit, -n ограничивает число строк.' },
    open: { prompt: 'Чем reload отличается от restart и когда нужен enable?', referenceAnswer: 'reload просит уже запущенное приложение перечитать собственную конфигурацию, если оно это поддерживает. restart останавливает и запускает процесс заново. enable создаёт связи для запуска unit при загрузке и не заменяет start.', explanation: 'Нужны разные назначения трёх команд.' },
  },
  {
    lessonId: 'linux-storage',
    singles: [
      { prompt: 'Почему df может показывать больше занятого места, чем du?', options: [['a', 'du не считает удалённый, но открытый файл'], ['b', 'df показывает только inode'], ['c', 'df не видит mount point']], correct: 'a', explanation: 'Блоки удалённого файла остаются заняты, пока процесс держит дескриптор.' },
      { prompt: 'Что показывает df -i?', options: [['a', 'Скорость диска'], ['b', 'Использование inode'], ['c', 'Только размер каталогов']], correct: 'b', explanation: 'df -i помогает найти исчерпание inode даже при свободных блоках.' },
    ],
    multiple: { prompt: 'Какие команды помогают расследовать заполненный /var?', options: [['a', 'df -h /var'], ['b', 'du -xhd1 /var'], ['c', 'lsof +L1'], ['d', 'kill -9 всех процессов']], correct: ['a', 'b', 'c'], explanation: 'Сначала измеряют ФС, видимые каталоги и открытые удалённые файлы.' },
    command: { prompt: 'Найдите удалённые файлы, которые всё ещё удерживаются процессами.', acceptedAnswers: ['lsof +L1'], explanation: '+L1 отбирает файлы с нулевым числом ссылок.' },
    open: { prompt: 'Чем symbolic link отличается от hard link?', referenceAnswer: 'Symbolic link хранит путь к другому объекту и может стать битой. Hard link — ещё одно имя того же inode: данные сохраняются, пока существует хотя бы одна ссылка и нет открытого дескриптора.', explanation: 'Важно различать путь и общий inode.' },
  },
  {
    lessonId: 'linux-network',
    singles: [
      { prompt: 'Что означает connection refused?', options: [['a', 'Хост достигнут, но соединение отклонено на порту'], ['b', 'DNS не нашёл имя'], ['c', 'Маршрут всегда отсутствует']], correct: 'a', explanation: 'Refused указывает на достижимый хост и отсутствие подходящего слушателя или явное отклонение.' },
      { prompt: 'Какой bind address делает сервис доступным на всех IPv4-интерфейсах?', options: [['a', '127.0.0.1'], ['b', '0.0.0.0'], ['c', 'localhost']], correct: 'b', explanation: '0.0.0.0 означает прослушивание всех IPv4-интерфейсов.' },
    ],
    multiple: { prompt: 'Какие слои стоит проверить для HTTP-запроса к сервису?', options: [['a', 'DNS'], ['b', 'Маршрут и доступность хоста'], ['c', 'Слушающий порт'], ['d', 'Цвет темы терминала']], correct: ['a', 'b', 'c'], explanation: 'Запрос проходит имя, маршрут/TCP и слушатель приложения.' },
    command: { prompt: 'Покажите TCP-порты в состоянии LISTEN и процессы-владельцы.', acceptedAnswers: ['ss -lntp'], explanation: 'ss -lntp показывает TCP LISTEN и PID/имена процессов.' },
    open: { prompt: 'Чем timeout отличается от DNS failure?', referenceAnswer: 'При DNS failure имя не преобразуется в IP, поэтому TCP-соединение ещё не начинается. Timeout означает, что ответа нет на пути или пакеты фильтруются/теряются после выбора адреса.', explanation: 'Нужно разделить резолвинг и сетевой путь.' },
  },
  {
    lessonId: 'linux-troubleshooting',
    singles: [
      { prompt: 'Какой первый шаг при неизвестной деградации сервера?', options: [['a', 'Зафиксировать симптом и безопасно измерить состояние'], ['b', 'Перезагрузить сервер'], ['c', 'Сразу удалить логи']], correct: 'a', explanation: 'Измерение помогает выбрать гипотезу и не разрушить полезный контекст.' },
      { prompt: 'Что описывает load average?', options: [['a', 'Среднее число выполняющихся и ожидающих CPU/непрерываемый I/O задач'], ['b', 'Процент занятого диска'], ['c', 'Только количество пользователей']], correct: 'a', explanation: 'Load average — очередь работы, а не прямой процент CPU.' },
    ],
    multiple: { prompt: 'Какие признаки требуют разных веток диагностики?', options: [['a', 'Высокий CPU'], ['b', 'OOMKilled в журнале'], ['c', 'Полный диск'], ['d', 'Название хоста']], correct: ['a', 'b', 'c'], explanation: 'CPU, память и диск имеют разные источники истины и команды.' },
    command: { prompt: 'Откройте интерактивный снимок нагрузки процессов.', acceptedAnswers: ['top'], explanation: 'top показывает нагрузку и процессы в момент наблюдения.' },
    open: { prompt: 'Как построить безопасный troubleshooting-путь?', referenceAnswer: 'Сначала фиксирую симптом и влияние, затем собираю минимальные наблюдения. Формулирую гипотезу, подтверждаю её командой, применяю минимальное исправление и обязательно проверяю исчезновение симптома.', explanation: 'Ценится причинно-следственная последовательность, а не случайные действия.' },
  },
  {
    lessonId: 'kubernetes-core',
    singles: [
      { prompt: 'Кто выбирает Node для нового Pod?', options: [['a', 'Scheduler'], ['b', 'etcd'], ['c', 'Service']], correct: 'a', explanation: 'Scheduler назначает Pod подходящей Node.' },
      { prompt: 'Какой объект поддерживает число Pod, созданных Deployment?', options: [['a', 'ReplicaSet'], ['b', 'ConfigMap'], ['c', 'Ingress']], correct: 'a', explanation: 'Deployment управляет ReplicaSet, а ReplicaSet поддерживает реплики Pod.' },
    ],
    multiple: { prompt: 'Какие компоненты относятся к control plane?', options: [['a', 'API Server'], ['b', 'Scheduler'], ['c', 'Controller Manager'], ['d', 'containerPort']], correct: ['a', 'b', 'c'], explanation: 'containerPort — поле спецификации контейнера, не компонент control plane.' },
    command: { prompt: 'Покажите Deployment web в namespace production.', acceptedAnswers: ['kubectl get deployment web -n production', 'kubectl get deploy web --namespace production'], explanation: 'Допустимы краткое имя ресурса и обе формы namespace-флага.' },
    open: { prompt: 'Опишите путь Deployment до работающего Pod.', referenceAnswer: 'Пользователь отправляет Deployment в API Server. Deployment controller создаёт или обновляет ReplicaSet, ReplicaSet создаёт Pod, Scheduler выбирает Node, а kubelet на этой Node запускает контейнеры.', explanation: 'Важен порядок и роль каждого компонента.' },
  },
  {
    lessonId: 'kubernetes-network',
    singles: [
      { prompt: 'Куда Service отправляет трафик после port?', options: [['a', 'На targetPort выбранных Pod'], ['b', 'На container image'], ['c', 'В API Server']], correct: 'a', explanation: 'Service port принимает трафик, targetPort указывает порт backend-контейнера.' },
      { prompt: 'Когда Ready=false Pod исключается из endpoints Service?', options: [['a', 'Когда он не проходит readiness'], ['b', 'Всегда при Running'], ['c', 'Только после удаления Service']], correct: 'a', explanation: 'Readiness определяет, можно ли направлять трафик к Pod.' },
    ],
    multiple: { prompt: 'Что может объяснить пустые endpoints у Service?', options: [['a', 'Selector не совпадает с labels'], ['b', 'Pod не Ready'], ['c', 'В namespace нет подходящих Pod'], ['d', 'У Service нет README']], correct: ['a', 'b', 'c'], explanation: 'Endpoints формируются из подходящих готовых Pod в том же namespace.' },
    command: { prompt: 'Покажите endpoints Service web в production.', acceptedAnswers: ['kubectl get endpoints web -n production', 'kubectl get ep web --namespace production'], explanation: 'Endpoints — быстрый способ увидеть backend-адреса Service.' },
    open: { prompt: 'Почему Running Pod может быть недоступен через Service?', referenceAnswer: 'Running не гарантирует Ready. Pod может не совпадать selector Service, быть неготовым из-за readiness probe или находиться в другом namespace. Нужно проверить selector/labels, readiness и endpoints.', explanation: 'Нужны Service, Pod и endpoints в одной диагностической цепочке.' },
  },
  {
    lessonId: 'kubernetes-config',
    singles: [
      { prompt: 'Что scheduler учитывает при размещении Pod?', options: [['a', 'requests'], ['b', 'liveness probe'], ['c', 'Service ClusterIP']], correct: 'a', explanation: 'requests CPU/memory резервируют ёмкость для scheduler.' },
      { prompt: 'Что означает OOMKilled?', options: [['a', 'Контейнер превысил memory limit'], ['b', 'Image не найден'], ['c', 'Service не имеет endpoints']], correct: 'a', explanation: 'Ядро остановило контейнер из-за лимита памяти; смотреть Last State и limit.' },
    ],
    multiple: { prompt: 'Какие утверждения о probes верны?', options: [['a', 'Readiness управляет попаданием в endpoints'], ['b', 'Liveness может инициировать рестарт'], ['c', 'Startup защищает медленный старт'], ['d', 'Readiness скачивает image']], correct: ['a', 'b', 'c'], explanation: 'Каждая probe решает свою задачу и не заменяет другие.' },
    command: { prompt: 'Опишите Pod api-7d8f в production, чтобы увидеть Last State и Events.', acceptedAnswers: ['kubectl describe pod api-7d8f -n production', 'kubectl describe po api-7d8f --namespace production'], explanation: 'describe содержит container states, ресурсы и Events.' },
    open: { prompt: 'Чем ConfigMap отличается от Secret и как безопасно их использовать?', referenceAnswer: 'ConfigMap хранит обычную конфигурацию, Secret — чувствительные значения. Оба можно передавать через env или volume, но нужно проверять имя, namespace и ключи, ограничивать доступ RBAC и не печатать Secret в логах.', explanation: 'Важно различать данные и доступ к ним.' },
  },
  {
    lessonId: 'kubernetes-troubleshooting',
    singles: [
      { prompt: 'Где искать конкретную причину CrashLoopBackOff?', options: [['a', 'В describe и logs --previous'], ['b', 'Только в Service'], ['c', 'В названии namespace']], correct: 'a', explanation: 'Статус указывает направление, а Events и логи раскрывают причину.' },
      { prompt: 'Что чаще всего означает ImagePullBackOff?', options: [['a', 'Не удаётся получить образ'], ['b', 'Scheduler разместил Pod'], ['c', 'Readiness успешна']], correct: 'a', explanation: 'Проверяют имя/тег образа, registry-доступ и Events.' },
    ],
    multiple: { prompt: 'Какие источники истины полезны для Pod в проблеме?', options: [['a', 'kubectl get pods'], ['b', 'kubectl describe pod'], ['c', 'kubectl logs --previous'], ['d', 'Удаление Pod без чтения логов']], correct: ['a', 'b', 'c'], explanation: 'Сначала классифицируют статус, затем читают Events и соответствующие логи.' },
    command: { prompt: 'Получите логи предыдущего контейнера Pod web-6d7c9f6b7d-2xk9m в production.', acceptedAnswers: ['kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production', 'kubectl logs web-6d7c9f6b7d-2xk9m -n production --previous'], explanation: '--previous выбирает предыдущий упавший экземпляр контейнера.' },
    open: { prompt: 'Какой порядок действий при Pod Pending?', referenceAnswer: 'Проверяю kubectl get pods, затем describe именно нужного Pending Pod и читаю Events scheduler. Смотрю requests, ресурсы Node, taints или PVC. Исправляю конкретный workload или освобождаю ёмкость и повторно проверяю состояние Pod.', explanation: 'Нужны конкретный Pod, Events и повторная проверка.' },
  },
]

export const quizQuestions = specs.flatMap(buildQuestions)
export const lessonQuestionCount = (lessonId: ModuleId) => quizQuestions.filter((question) => question.lessonId === lessonId).length
export const totalQuestionCount = quizQuestions.length
