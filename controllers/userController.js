const db = require("../config/db");

const getUsersPage = async (req, res, next) => {
  const { searchBy, query } = req.query;

  try {
    /*
            TODO: 검색어에 맞춰 유저 목록을 출력하는 페이지를 렌더링하는 코드를 작성하세요.
        */
    let sqlQuery = `
            SELECT 
                u.user_id as id,
                u.user_name as username,
                r.role_name as role
            FROM User u
            JOIN Role r ON u.role_id = r.role_id
        `;

    const params = [];

    // 검색 조건 추가
    if (query && searchBy) {
      if (searchBy === "username") {
        sqlQuery += ` WHERE u.user_name LIKE ?`;
        params.push(`%${query}%`);
      } else if (searchBy === "role") {
        sqlQuery += ` WHERE r.role_name LIKE ?`;
        params.push(`%${query}%`);
      }
    }

    // 정렬
    sqlQuery += ` ORDER BY u.user_name ASC`;

    const [users] = await db.query(sqlQuery, params);

    res.render("pages/users", {
      title: "User Management",
      users: users,
      searchBy,
      query,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getUsersPage,
};
