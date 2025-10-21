const db = require("../config/db");
const adminCode = "2021085078"; // TODO: admin code(본인 학번)를 추가하세요.

const getLoginPage = (req, res) => {
  res.render("pages/login", { title: "Login" });
};

const getRegisterPage = (req, res) => {
  res.render("pages/register", { title: "Register" });
};

const logoutAndGetHomePage = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
};

const postLogin = async (req, res, next) => {
  const { username, password } = req.body;
  try {
    /*
            TODO: username 과 password를 이용해 로그인을 진행하는 코드를 작성하세요.
        */
    const [rows] = await db.query(
      "SELECT * FROM User WHERE user_name = ? AND password = ?",
      [username, password]
    );

    const user = rows[0];
    if (user) {
      req.session.userId = user.user_id;
      req.session.username = user.user_name;
      req.session.role = user.role_id; // role_id 1=user, 2=admin
      res.redirect("/");
    } else {
      const err = new Error("Invalid username or password.");
      return next(err);
    }
  } catch (err) {
    return next(err);
  }
};

const postRegister = async (req, res, next) => {
  const { username, password, role, admin_code } = req.body;

  const connection = await db.pool.getConnection(); // Mysql에서의 연결 객체

  try {
    /*
            TODO: username, password, role, admin_code를 이용해 새로운 계정을 추가하는 코드를 작성하세요.
        */
    await connection.beginTransaction(); // 트랜잭션 시작

    // 사용자 중복 체크
    const [existingUsers] = await connection.query(
      "SELECT * FROM User WHERE user_name = ?",
      [username]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return next(new Error("Username already exists."));
    }

    // 관리자 코드 검증
    if (role === "admin" && admin_code !== adminCode) {
      await connection.rollback();
      return next(new Error("The admin code is incorrect."));
    }

    // role_id 설정 (1=user, 2=admin)
    const role_id = role === "admin" ? 2 : 1;
    const admin_id = role === "admin" ? 1 : null; // admin일 때만 연결

    // 사용자 등록
    await connection.query(
      "INSERT INTO User (user_name, password, role_id, admin_id) VALUES (?, ?, ?, ?)",
      [username, password, role_id, admin_id]
    );

    await connection.commit(); // 트랜잭션 커밋
    res.redirect("/login");
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

module.exports = {
  getLoginPage,
  getRegisterPage,
  logoutAndGetHomePage,
  postLogin,
  postRegister,
};
