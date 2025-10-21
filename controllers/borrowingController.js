const db = require("../config/db");

const getBorrowingsPage = async (req, res, next) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.redirect("/login");
  }

  try {
    /*
            TODO: 유저의 대여 기록을 모두 출력하는 페이지를 렌더링하는 코드를 작성하세요.
        */
    const [borrowings] = await db.query(
      `SELECT 
                br.record_id as id,
                CONCAT(br.book_id, LPAD(br.copy_no, 2, '0')) as book_instance_id,
                b.title as book_title,
                a.author_name as book_author,
                DATE_FORMAT(br.borrow_date, '%Y.%m.%d') as borrow_date,
                DATE_FORMAT(br.return_date, '%Y.%m.%d') as return_date,
                CASE 
                    WHEN br.return_date IS NULL THEN 'borrowed'
                    ELSE 'returned'
                END as status
            FROM BorrowRecord br
            JOIN Book b ON br.book_id = b.book_id
            LEFT JOIN Author a ON b.author_id = a.author_id
            WHERE br.user_id = ?
            ORDER BY br.borrow_date DESC`,
      [userId]
    );

    res.render("pages/borrowings", {
      title: "My Borrowing History",
      borrowings: borrowings,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBorrowingsPage,
};
