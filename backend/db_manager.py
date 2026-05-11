import docker, json, os, random, sys, re, time, threading, itertools, socket, tarfile, io
from dotenv import load_dotenv

load_dotenv()

client = docker.from_env()
CONFIG_FILE = "databases.json"

try:
    my_container_id = socket.gethostname()
    my_container = client.containers.get(my_container_id)
    NETWORK_NAME = list(my_container.attrs['NetworkSettings']['Networks'].keys())[0]
except Exception:
    NETWORK_NAME = "bridge"

def load_cfg():
    return json.load(open(CONFIG_FILE)) if os.path.exists(CONFIG_FILE) else {}

def save_cfg(d):
    json.dump(d, open(CONFIG_FILE, "w"), indent=4)

def print_active_dbs(cfg):
    print("\n--- Активні бази ---")
    if not cfg:
        print(f"⚠️ {YELLOW}БД не знайдено.{RESET}")
        return False
    for db_id, data in cfg.items():
        eng, ver = data.get('engine', 'unknown'), data.get('version', 'latest')
        print(f" - {GREEN}{db_id}{RESET} [{eng}:{ver}] (порт: {data['port']})")
    return True

def add_db(engine, version="latest"):
    engine = re.sub(r'[^\w.-]', '', str(engine)).lower()
    version = re.sub(r'[^\w.-]', '', str(version))

    db_id = f"rdb_{engine}_{random.randint(1000, 9999)}"
    cfg = load_cfg()
    post_init_cmd = None

    if engine == "postgres":
        img, port = f"postgres:{version}-alpine", random.randint(5433, 5499)
        usr = os.getenv("PG_USER", "admin")
        pwd = os.getenv("PG_PASS", "secret")
        dbn = os.getenv("PG_DB", "stand_db")

        env = [f"POSTGRES_USER={usr}", f"POSTGRES_PASSWORD={pwd}", f"POSTGRES_DB={dbn}"]
        url = f"postgresql://{usr}:{pwd}@{db_id}:5432/{dbn}"
        hc = {"test": ["CMD-SHELL", f"pg_isready -U {usr} -d {dbn}"], "interval": 10000000000, "timeout": 5000000000, "retries": 5, "start_period": 10000000000}

    elif engine == "mysql":
        img, port = f"mysql:{version}", random.randint(3307, 3399)

        # 💡 Читаємо ВСІ змінні правильно
        usr = os.getenv("MYSQL_USER", "admin")
        pwd = os.getenv("MYSQL_PASS", "secret")
        root_pwd = os.getenv("MYSQL_ROOT_PASS", "secret")
        dbn = os.getenv("MYSQL_DB", "stand_db")

        # 💡 Наказуємо Docker створити користувача
        env = [
            f"MYSQL_ROOT_PASSWORD={root_pwd}",
            f"MYSQL_DATABASE={dbn}",
            f"MYSQL_USER={usr}",
            f"MYSQL_PASSWORD={pwd}"
        ]
        url = f"mysql+pymysql://{usr}:{pwd}@{db_id}:3306/{dbn}"

        # Healthcheck робимо через root, щоб було надійно
        hc = {"test": ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", f"-p{root_pwd}"], "interval": 10000000000, "timeout": 5000000000, "retries": 5, "start_period": 15000000000}

        # 💡 Команда, яка виконається ПІСЛЯ запуску, щоб дати права
        post_init_cmd = f"sh -c \"mysql -u root -p{root_pwd} -e \\\"GRANT ALL PRIVILEGES ON *.* TO '{usr}'@'%'; FLUSH PRIVILEGES;\\\"\""

    elif engine == "oracle":
        img, port = f"gvenzl/oracle-free:{version}", random.randint(1522, 1599)
        usr, pwd, dbn = "admin", "secret", "freepdb1"
        env = [f"ORACLE_PASSWORD={pwd}", f"APP_USER={usr}", f"APP_PASSWORD={pwd}"]
        url = f"oracle+oracledb://{usr}:{pwd}@{db_id}:1521/?service_name={dbn}"
        hc = {"test": ["CMD", "healthcheck.sh"], "interval": 15000000000, "timeout": 10000000000, "retries": 10, "start_period": 120000000000}

    elif engine == "mssql":
        img, port = f"mcr.microsoft.com/mssql/server:{version}", random.randint(1434, 1499)
        usr, pwd, dbn = "sa", "SuperSecret123!", "master"
        env = ["ACCEPT_EULA=Y", f"MSSQL_SA_PASSWORD={pwd}"]
        url = f"mssql+pymssql://{usr}:{pwd}@{db_id}:1433/{dbn}"
        hc = {"test": ["CMD", "/opt/mssql-tools/bin/sqlcmd", "-U", usr, "-P", pwd, "-Q", "SELECT 1"], "interval": 10000000000, "timeout": 5000000000, "retries": 5, "start_period": 60000000000}
    else: return print("❌ Error: Invalid engine. Use postgres, mysql, oracle, or mssql.")

    print(f"🚀 Пробудження {img} (ID: {db_id})...")
    try:
        try:
            client.images.get(img)
        except docker.errors.ImageNotFound:
            print(f"⬇️ Образ не знайдено локально. Починаю стягувати {img} з Docker Hub...")
            is_pulling = True
            def pull_spinner():
                chars = itertools.cycle(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'])
                while is_pulling:
                    sys.stdout.write(f"\r{YELLOW}   Завантаження гігабайтів даних... {next(chars)}{RESET} ")
                    sys.stdout.flush()
                    time.sleep(0.1)
            t = threading.Thread(target=pull_spinner)
            t.start()
            try:
                client.images.pull(img)
            finally:
                is_pulling = False
                t.join()
            print(f"\r{GREEN}✅ Образ успішно завантажено!{' ' * 30}{RESET}")

        print("⏳ Запуск та очікування ініціалізації БД ", end="")
        sys.stdout.flush()

        c = client.containers.run(
            img, name=db_id, environment=env,
            ports={f"{'5432' if engine=='postgres' else '3306' if engine=='mysql' else '1521' if engine=='oracle' else '1433'}/tcp": port},
            healthcheck=hc, network=NETWORK_NAME, detach=True
        )

        max_retries = 90
        for _ in range(max_retries):
            c.reload()
            health_status = c.attrs.get('State', {}).get('Health', {}).get('Status', 'starting')
            if health_status == 'healthy':
                print(" ✅ ГОТОВО!")
                # 💡 Виконуємо GRANT після того, як база ожила
                if post_init_cmd:
                    print(f" 🔑 Налаштування глобальних прав для {usr}...")
                    c.exec_run(post_init_cmd)
                break
            elif health_status == 'unhealthy':
                print(" ❌ ПОМИЛКА (Unhealthy)!")
                c.remove(force=True)
                raise Exception(f"Контейнер {db_id} не зміг запуститися. Можливо, не вистачає RAM.")
            print(".", end="")
            sys.stdout.flush()
            time.sleep(2)
        else:
            print(" ⚠️ ТАЙМАУТ!")
            c.remove(force=True)
            raise Exception("База завантажується занадто довго. Контейнер знищено.")

        cfg[db_id] = {"engine": engine, "version": version, "port": port, "server": "localhost", "user": usr, "password": pwd, "database": dbn, "url": url, "id": c.id}
        save_cfg(cfg)
        print(f"✅ БД {db_id} інтегрована! Доступна на локальному порту {port}")
    except Exception as e: print(f"\n❌ Docker Error: {e}")

def rm_db(db_id):
    cfg = load_cfg()
    if db_id not in cfg: return print("❌ БД не знайдено")
    try:
        print(f"🗑 Видалення {db_id}...")
        client.containers.get(cfg[db_id]["id"]).remove(force=True, v=True)
        del cfg[db_id]; save_cfg(cfg)
        print("✅ Успішно видалено")
    except: del cfg[db_id]; save_cfg(cfg)

def dump_db(db_id):
    cfg = load_cfg()
    if db_id not in cfg: return print(f"❌ БД {db_id} не знайдено.")

    data = cfg[db_id]
    engine, container_id, usr, pwd, dbn = data['engine'], data['id'], data['user'], data['password'], data['database']

    if engine not in ["postgres", "mysql"]:
        return print(f"⚠️ Дамп для {engine} поки не підтримується автоматично. Використовуй native-утиліти.")

    print(f"📦 Підготовка дампу для {db_id} ({engine})...")
    try:
        container = client.containers.get(container_id)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{db_id}_{timestamp}.sql"

        # 💡 Дамп MySQL завжди робиться через root
        if engine == "mysql":
            root_pwd = os.getenv("MYSQL_ROOT_PASS", "super_secure_root_password")
            cmd = f"mysqldump -u root -p{root_pwd} {dbn}"
        else:
            cmd = f"pg_dump -U {usr} -d {dbn}"

        is_working = True
        def spinner():
            chars = itertools.cycle(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'])
            while is_working:
                sys.stdout.write(f"\r{YELLOW}   Генерація SQL-дампу... {next(chars)}{RESET} ")
                sys.stdout.flush()
                time.sleep(0.1)
        t = threading.Thread(target=spinner); t.start()

        exit_code, output = container.exec_run(cmd)
        is_working = False; t.join()

        if exit_code == 0:
            with open(filename, "wb") as f: f.write(output)
            print(f"\r{GREEN}✅ Дамп успішно збережено! Файл: {filename}{' '*20}{RESET}")
        else:
            print(f"\r{YELLOW}❌ Помилка дампу:{RESET}\n{output.decode('utf-8', errors='ignore')}")
    except Exception as e: print(f"\n❌ Docker Error: {e}")

def restore_db(db_id, filename):
    if not os.path.exists(filename): return print(f"❌ Файл {filename} не знайдено!")
    cfg = load_cfg()
    if db_id not in cfg: return print(f"❌ БД {db_id} не знайдено.")

    data = cfg[db_id]
    engine, container_id, usr, pwd, dbn = data['engine'], data['id'], data['user'], data['password'], data['database']

    if engine not in ["postgres", "mysql"]:
        return print(f"⚠️ Відновлення для {engine} поки не підтримується автоматично.")

    print(f"⏳ Відновлення {db_id} з файлу {filename}...")
    try:
        container = client.containers.get(container_id)

        # Закидаємо файл всередину контейнера через Tar-архів
        tar_stream = io.BytesIO()
        with tarfile.open(fileobj=tar_stream, mode='w') as tar:
            tar.add(filename, arcname="backup_restore.sql")
        tar_stream.seek(0)
        container.put_archive("/tmp", tar_stream)

        if engine == "mysql":
            root_pass = os.getenv("MYSQL_ROOT_PASS", "super_secure_root_password")
            cmd = f"sh -c 'mysql -u root -p{root_pass} {dbn} < /tmp/backup_restore.sql'"
        else:
            cmd = f"psql -U {usr} -d {dbn} -f /tmp/backup_restore.sql"

        is_working = True
        def spinner():
            chars = itertools.cycle(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'])
            while is_working:
                sys.stdout.write(f"\r{YELLOW}   Завантаження даних у БД... {next(chars)}{RESET} ")
                sys.stdout.flush()
                time.sleep(0.1)
        t = threading.Thread(target=spinner); t.start()

        exit_code, output = container.exec_run(cmd)
        container.exec_run("rm /tmp/backup_restore.sql") # Прибираємо сміття
        is_working = False; t.join()

        if exit_code == 0:
            print(f"\r{GREEN}✅ Базу успішно відновлено!{' '*20}{RESET}")
        else:
            print(f"\r{YELLOW}❌ Помилка відновлення:{RESET}\n{output.decode('utf-8', errors='ignore')}")
    except Exception as e: print(f"\n❌ Docker Error: {e}")

def reconnect_db(db_id):
    print(f"\n🛠️  Спроба реанімації бази {db_id}...")
    try:
        container = client.containers.get(db_id)
        network = client.networks.get(NETWORK_NAME)

        # 1. Спроба підключити віртуальний кабель до поточної мережі
        try:
            network.connect(container)
            print(f"🔌 {GREEN}Мережевий кабель ({NETWORK_NAME}) успішно підключено!{RESET}")
        except docker.errors.APIError as e:
            if "already exists in network" in str(e):
                print(f"ℹ️ {YELLOW}Контейнер вже підключений до цієї мережі.{RESET}")
            else:
                print(f"⚠️ {YELLOW}Попередження мережі: {e}{RESET}")

        # 2. Запуск контейнера
        container.start()
        print(f"🚀 {GREEN}Сервер {db_id} успішно запущено і готовий до роботи!{RESET}")

    except docker.errors.NotFound:
        print(f"❌ {YELLOW}Помилка: Контейнер {db_id} не знайдено в системі Docker.{RESET}")
    except Exception as e:
        print(f"❌ Помилка реанімації: {e}")

def print_usage():
    print(f"\n{YELLOW}Команда 'add' вимагає назву рушія (engine).{RESET}")
    print(f"Доступні рушії: {GREEN}postgres, mysql, oracle, mssql{RESET}")
    print("-" * 40)
    print(f"Приклади: make db-add engine=mysql version=9.7")
    print("-" * 40 + "\n")

def interactive_menu():
    print("\n" + "="*45)
    print(f" 🗄️  {GREEN}GOD MODE: Менеджер Баз Даних{RESET}")
    print("="*45)

    while True:
        print("\nДоступні дії:")
        print("  1. 🟢 Додати нову БД")
        print("  2. 🔴 Видалити існуючу БД")
        print("  3. 📋 Показати активні БД")
        print("  4. 💾 Зробити дамп БД")
        print("  5. ⏳ Відновити дамп БД")
        print("  8. 🔌 Реанімувати БД (Перепідключити до поточної мережі)")
        print("  0. ❌ Вихід")

        choice = input("\n👉 Оберіть дію (0-5, 8): ").strip()

        if choice == '1':
            print(f"\nДоступні рушії: {YELLOW}postgres, mysql, oracle, mssql{RESET}")
            engine = input("Введіть рушій [postgres]: ").strip().lower() or "postgres"
            version = input("Введіть версію [latest]: ").strip() or "latest"
            print("-" * 30); add_db(engine, version)

        elif choice == '2':
            if print_active_dbs(load_cfg()):
                db_id = input("\nВведіть ID бази для видалення або Enter для відміни: ").strip()
                if db_id: print("-" * 30); rm_db(db_id)

        elif choice == '3':
            cfg = load_cfg()
            if print_active_dbs(cfg):
                print(json.dumps(cfg, indent=2, ensure_ascii=False))

        elif choice == '4':
            if print_active_dbs(load_cfg()):
                db_id = input("\nВведіть ID бази для експорту (дампу): ").strip()
                if db_id: print("-" * 30); dump_db(db_id)

        elif choice == '5':
            if print_active_dbs(load_cfg()):
                db_id = input("\nВведіть ID цільової бази: ").strip()
                if db_id:
                    filename = input("Введіть назву SQL файлу (напр. backup.sql): ").strip()
                    if filename: print("-" * 30); restore_db(db_id, filename)

        elif choice == '8':
            if print_active_dbs(load_cfg()):
                db_id = input("\nВведіть ID бази для реанімації (напр. rdb_mysql_2489): ").strip()
                if db_id: reconnect_db(db_id)

        elif choice == '0':
            print("👋 Вихід з менеджера. Хай щастить, Tech Lead!"); break
        else:
            print(f"⚠️ {YELLOW}Невідома команда. Спробуйте ще раз.{RESET}")

if __name__ == "__main__":
    GREEN, YELLOW, RESET = '\033[92m', '\033[93m', '\033[0m'

    if len(sys.argv) < 2:
        try: interactive_menu()
        except KeyboardInterrupt: print("\n👋 Примусовий вихід. До зустрічі!")
        sys.exit(0)

    action = sys.argv[1]

    if action == "add":
        if len(sys.argv) < 3: print_usage(); sys.exit(1)
        add_db(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "latest")
    elif action == "rm":
        if len(sys.argv) < 3: print(f"❌ Помилка: Вкажіть ID бази"); sys.exit(1)
        rm_db(sys.argv[2])
    elif action == "list":
        print(json.dumps(load_cfg(), indent=2, ensure_ascii=False))
    elif action == "dump":
        if len(sys.argv) < 3: print(f"❌ Помилка: Вкажіть ID бази"); sys.exit(1)
        dump_db(sys.argv[2])
    elif action == "restore":
        if len(sys.argv) < 4: print(f"❌ Помилка: Вкажіть ID бази та файл (напр. backup.sql)"); sys.exit(1)
        restore_db(sys.argv[2], sys.argv[3])
    else:
        print(f"❌ Невідома команда: {action}")
