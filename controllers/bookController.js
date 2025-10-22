const db = require("../config/db");

const getBooksPage = async (req, res, next) => {
  const { query: searchQuery, searchBy } = req.query;
  const sortedByWithDefault = req.query.sortBy || "title";
  const sortOrderWithDefault = req.query.sortOrder || "asc";

  try {
    /*
            TODO: 검색어, 정렬 기준에 맞춰 책 목록을 출력하는 페이지를 렌더링하는 코드를 작성하세요.
        */
    // 기본 쿼리 구성
    let query = `
      SELECT 
        b.book_id as id,
        b.title,
        a.author_name as author,
        GROUP_CONCAT(DISTINCT c.category_name SEPARATOR ', ') as categories,
        b.quantity as total_quantity,
        COUNT(CASE WHEN bc.status = 'available' THEN 1 END) as available_quantity
      FROM Book b
      LEFT JOIN Author a ON b.author_id = a.author_id
      LEFT JOIN BookCategory bcat ON b.book_id = bcat.book_id
      LEFT JOIN Category c ON bcat.category_id = c.category_id
      LEFT JOIN BookCopy bc ON b.book_id = bc.book_id
    `;

    const params = [];

    // 검색 조건 추가
    if (searchQuery && searchBy) {
      if (searchBy === "title") {
        query += ` WHERE b.title LIKE ?`;
        params.push(`%${searchQuery}%`);
      } else if (searchBy === "author") {
        query += ` WHERE a.author_name LIKE ?`;
        params.push(`%${searchQuery}%`);
      } else if (searchBy === "category") {
        query += ` WHERE c.category_name LIKE ?`;
        params.push(`%${searchQuery}%`);
      }
    }

    // GROUP BY 추가
    query += ` GROUP BY b.book_id, b.title, a.author_name`;

    // 정렬 조건 추가
    const validSortColumns = [
      "title",
      "author",
      "total_quantity",
      "available_quantity",
    ];
    const validSortOrders = ["asc", "desc"];

    const sortColumn = validSortColumns.includes(sortedByWithDefault)
      ? sortedByWithDefault
      : "title";
    const sortDir = validSortOrders.includes(sortOrderWithDefault)
      ? sortOrderWithDefault
      : "asc";

    if (sortColumn === "author") {
      query += ` ORDER BY a.author_name ${sortDir}`;
    } else if (sortColumn === "title") {
      query += ` ORDER BY b.title ${sortDir}`;
    } else {
      query += ` ORDER BY ${sortColumn} ${sortDir}`;
    }

    const [books] = await db.query(query, params);

    res.render("pages/books", {
      title: "All Books",
      books: books,
      sortBy: sortedByWithDefault,
      sortOrder: sortOrderWithDefault,
      query: searchQuery,
      searchBy: searchBy,
    });
  } catch (err) {
    next(err);
  }
};

const getAddBookPage = async (req, res, next) => {
  try {
    /*
            TODO: 책을 추가하는 페이지를 렌더링 하는 코드를 작성하세요.
            책 추가 시 작가와 카테고리를 선택해야하므로 현재 카테고리 목록과 작가 목록을 불러와야 합니다.
        */
    // 카테고리 목록 조회
    const [categories] = await db.query(
      `SELECT category_id as id, category_name as name FROM Category ORDER BY category_name`
    );

    // 저자 목록 조회
    const [authors] = await db.query(
      `SELECT author_id as id, author_name as name FROM Author ORDER BY author_name`
    );

    res.render("pages/add-book", {
      title: "Add New Book",
      categories: categories,
      authors: authors,
    });
  } catch (err) {
    next(
      new Error(
        "The page you added to the book could not be found. Please contact the administrator."
      )
    );
  }
};

const postAddBook = async (req, res, next) => {
  const { title, authors, quantity, categories } = req.body;
  const adminId = req.session.adminId || null;

  const connection = await db.pool.getConnection();

  try {
    /*
            TODO: 책을 DB에 추가하는 작업을 수행하는 코드를 작성하세요.
            기존에 없는 카테고리와 저자 또한 추가해줘야 합니다.
        */
    await connection.beginTransaction();

    // 1. 저자 처리 (없으면 추가)
    let authorId;
    if (authors && typeof authors === "string" && authors.trim() !== "") {
      if (authors.startsWith("id:")) {
        const parsedAuthorId = Number(authors.slice(3));
        if (!Number.isNaN(parsedAuthorId)) {
          authorId = parsedAuthorId;
        }
      } else {
        const trimmedAuthor = authors.trim();
        const [existingAuthor] = await connection.query(
          `SELECT author_id FROM Author WHERE author_name = ?`,
          [trimmedAuthor]
        );

        if (existingAuthor.length > 0) {
          authorId = existingAuthor[0].author_id;
        } else {
          const [authorResult] = await connection.query(
            `INSERT INTO Author (author_name) VALUES (?)`,
            [trimmedAuthor]
          );
          authorId = authorResult.insertId;
        }
      }
    }

    // 2. 책(제목) 확인 및 조회
    const sanitizedTitle = typeof title === "string" ? title.trim() : "";
    if (sanitizedTitle.length === 0) {
      await connection.rollback();
      const err = new Error("Book title is required.");
      err.status = 400;
      return next(err);
    }

    const parsedQuantity = Number.parseInt(quantity, 10);
    const bookQuantity =
      Number.isNaN(parsedQuantity) || parsedQuantity <= 0 ? 1 : parsedQuantity;

    const [existingBookRows] = await connection.query(
      `SELECT book_id, quantity, author_id FROM Book WHERE title = ? ORDER BY book_id LIMIT 1`,
      [sanitizedTitle]
    );

    let bookId;
    let existingBookQuantity = 0;

    if (existingBookRows.length > 0) {
      bookId = existingBookRows[0].book_id;
      existingBookQuantity = Number(existingBookRows[0].quantity) || 0;

      if (
        authorId &&
        (existingBookRows[0].author_id === null ||
          existingBookRows[0].author_id === undefined)
      ) {
        await connection.query(
          `UPDATE Book SET author_id = ? WHERE book_id = ?`,
          [authorId, bookId]
        );
      }
    } else {
      const [bookResult] = await connection.query(
        `INSERT INTO Book (title, author_id, quantity, admin_id) VALUES (?, ?, ?, ?)`,
        [sanitizedTitle, authorId || null, bookQuantity, adminId]
      );
      bookId = bookResult.insertId;
    }

    // 3. 카테고리 연결
    const categoryInputs = Array.isArray(categories)
      ? categories
      : categories
      ? [categories]
      : [];

    for (const rawCategory of categoryInputs) {
      if (!rawCategory || typeof rawCategory !== "string") {
        continue;
      }

      let categoryId = null;
      if (rawCategory.startsWith("id:")) {
        const parsedId = Number(rawCategory.slice(3));
        if (!Number.isNaN(parsedId)) {
          categoryId = parsedId;
        }
      } else {
        const trimmedName = rawCategory.trim();
        if (trimmedName.length === 0) {
          continue;
        }

        const [existingCategory] = await connection.query(
          `SELECT category_id FROM Category WHERE category_name = ?`,
          [trimmedName]
        );

        if (existingCategory.length > 0) {
          categoryId = existingCategory[0].category_id;
        } else {
          const [newCategory] = await connection.query(
            `INSERT INTO Category (category_name, admin_id) VALUES (?, ?)`,
            [trimmedName, adminId]
          );
          categoryId = newCategory.insertId;
        }
      }

      if (categoryId) {
        const [alreadyLinked] = await connection.query(
          `SELECT 1 FROM BookCategory WHERE book_id = ? AND category_id = ?`,
          [bookId, categoryId]
        );
        if (alreadyLinked.length === 0) {
          await connection.query(
            `INSERT INTO BookCategory (book_id, category_id) VALUES (?, ?)`,
            [bookId, categoryId]
          );
        }
      }
    }

    // 4. BookCopy 추가 (quantity만큼)
    const [maxCopyRows] = await connection.query(
      `SELECT COALESCE(MAX(copy_no), 0) AS maxCopyNo FROM BookCopy WHERE book_id = ?`,
      [bookId]
    );
    let nextCopyNo = Number(maxCopyRows[0].maxCopyNo) || 0;

    for (let i = 1; i <= bookQuantity; i++) {
      nextCopyNo += 1;
      await connection.query(
        `INSERT INTO BookCopy (book_id, copy_no, status) VALUES (?, ?, 'available')`,
        [bookId, nextCopyNo]
      );
    }

    const updatedQuantity = existingBookQuantity + bookQuantity;
    await connection.query(`UPDATE Book SET quantity = ? WHERE book_id = ?`, [
      updatedQuantity,
      bookId,
    ]);
    // 5. 관리 로그 기록 - 추가 기능 1
    await connection.query(
      `INSERT INTO ManageLog (admin_id, book_id, book_title, action_type, change_amount)
       VALUES (?, ?, ?, 'add', ?)`,
      [adminId || null, bookId, sanitizedTitle, bookQuantity]
    );

    await connection.commit();
    res.redirect("/books");
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

const postDeleteBookInstance = async (req, res, next) => {
  const bookInstanceId = Number(req.params.id);
  // 추가 기능 1을 위해서 adminId도 가져옴
  const adminId = req.session.adminId || null;

  const connection = await db.pool.getConnection();

  try {
    /*
            TODO: 책 한 권을 제거하는 작업을 수행하는 코드를 작성하세요.
            동일한 책을 모두 제거하면 해당 책에 대한 정보도 지워지도록 구현해주세요.
        */
    await connection.beginTransaction();

    // 1. BookCopy에서 book_id 조회
    const [copyInfo] = await connection.query(
      `SELECT book_id, copy_no FROM BookCopy WHERE book_id = ? AND copy_no = ?`,
      [Math.floor(bookInstanceId / 100), bookInstanceId % 100]
    );

    if (copyInfo.length === 0) {
      await connection.rollback();
      const err = new Error("Book copy not found");
      err.status = 404;
      return next(err);
    }

    const bookId = copyInfo[0].book_id;
    const copyNo = copyInfo[0].copy_no;
    // 책 제목 조회 - 추가 기능 1
    const [bookRows] = await connection.query(
      `SELECT title FROM Book WHERE book_id = ?`,
      [bookId]
    );
    const rawBookTitle =
      bookRows.length > 0 && typeof bookRows[0].title === "string"
        ? bookRows[0].title
        : "";
    const trimmedBookTitle = rawBookTitle.trim();
    const bookTitle =
      trimmedBookTitle.length > 0 ? trimmedBookTitle : `Book #${bookId}`;

    // 2. 대출 중인지 확인
    const [borrowStatus] = await connection.query(
      `SELECT record_id FROM BorrowRecord 
       WHERE book_id = ? AND copy_no = ? AND return_date IS NULL`,
      [bookId, copyNo]
    );

    if (borrowStatus.length > 0) {
      await connection.rollback();
      const err = new Error("Cannot delete a borrowed book");
      err.status = 400;
      return next(err);
    }

    // 3. BookCopy 삭제
    await connection.query(
      `DELETE FROM BookCopy WHERE book_id = ? AND copy_no = ?`,
      [bookId, copyNo]
    );

    // 4. 남은 BookCopy 개수 확인
    const [remainingCopies] = await connection.query(
      `SELECT COUNT(*) as count FROM BookCopy WHERE book_id = ?`,
      [bookId]
    );

    // 5. 남은 복사본이 없으면 Book도 삭제
    if (remainingCopies[0].count === 0) {
      await connection.query(`DELETE FROM Book WHERE book_id = ?`, [bookId]);
    } else {
      // 6. Book의 quantity 업데이트
      await connection.query(`UPDATE Book SET quantity = ? WHERE book_id = ?`, [
        remainingCopies[0].count,
        bookId,
      ]);
    }
    // 7. 관리 로그 기록 - 추가 기능 1
    await connection.query(
      `INSERT INTO ManageLog (admin_id, book_id, book_title, action_type, change_amount)
       VALUES (?, ?, ?, 'remove', -1)`,
      [adminId, bookId, bookTitle]
    );

    await connection.commit();
    res.redirect("/books");
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

const postBorrowBook = async (req, res, next) => {
  const bookInstanceId = Number(req.params.id);
  const userId = req.session.userId;

  if (!userId) {
    return res.redirect("/login");
  }

  const connection = await db.pool.getConnection();

  try {
    /*
            TODO: 특정 책을 대여하는 작업을 수행하는 코드를 작성하세요.
            명세에 있는 조건들을 어기는 작업일 경우에는 다음과 같이 에러페이지로 유도하면 됩니다.

            ```
                const err = new Error('You have reached the maximum borrowing limit (3 books).');
                err.status = 400;
                return next(err);
            ```
    */
    await connection.beginTransaction();

    // 추가: 연체 여부 확인 (우선순위 최상위)
    const [overdueRecords] = await connection.query(
      `SELECT 1 FROM BorrowRecord
        WHERE user_id = ? AND return_date IS NULL
          AND borrow_date <= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        LIMIT 1`,
      [userId]
    );

    if (overdueRecords.length > 0) {
      await connection.rollback();
      const err = new Error(
        "You cannot borrow books while you have overdue books (7+ days)."
      );
      err.status = 400;
      return next(err);
    }

    // bookInstanceId를 book_id와 copy_no로 분리
    const bookId = Math.floor(bookInstanceId / 100);
    const copyNo = bookInstanceId % 100;

    // 1. 현재 대출 중인 책 개수 확인
    const [currentBorrows] = await connection.query(
      `SELECT COUNT(*) as count FROM BorrowRecord 
       WHERE user_id = ? AND return_date IS NULL`,
      [userId]
    );

    if (currentBorrows[0].count >= 3) {
      await connection.rollback();
      const err = new Error(
        "You have reached the maximum borrowing limit (3 books)."
      );
      err.status = 400;
      return next(err);
    }

    // 추가: 동일한 책(동일 bookId)을 동시에 2권 이상 대출하지 못하도록 검사
    const [sameBookBorrow] = await connection.query(
      `SELECT 1 FROM BorrowRecord 
       WHERE user_id = ? AND book_id = ? AND return_date IS NULL
       LIMIT 1`,
      [userId, bookId]
    );

    if (sameBookBorrow.length > 0) {
      await connection.rollback();
      const err = new Error(
        "You cannot borrow multiple copies of the same book simultaneously."
      );
      err.status = 400;
      return next(err);
    }

    // 2. 책 상태 확인
    const [bookCopy] = await connection.query(
      `SELECT status FROM BookCopy WHERE book_id = ? AND copy_no = ?`,
      [bookId, copyNo]
    );

    if (bookCopy.length === 0) {
      await connection.rollback();
      const err = new Error("Book copy not found");
      err.status = 404;
      return next(err);
    }

    if (bookCopy[0].status !== "available") {
      await connection.rollback();
      const err = new Error("This book is not available for borrowing");
      err.status = 400;
      return next(err);
    }

    // 3. 대출 기록 추가
    await connection.query(
      `INSERT INTO BorrowRecord (user_id, book_id, copy_no, borrow_date) 
       VALUES (?, ?, ?, CURDATE())`,
      [userId, bookId, copyNo]
    );

    // 4. BookCopy 상태 업데이트
    await connection.query(
      `UPDATE BookCopy SET status = 'borrowed' WHERE book_id = ? AND copy_no = ?`,
      [bookId, copyNo]
    );

    await connection.commit();
    res.redirect("/books");
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

const postReturnBook = async (req, res, next) => {
  const borrowingId = Number(req.params.id);
  const userId = req.session.userId;

  if (!userId) {
    return res.redirect("/login");
  }

  const connection = await db.pool.getConnection();

  try {
    /*
            TODO: 자신이 책을 빌린 기록을 반납 처리하는 코드를 작성해주세요.
            다른 사람이 빌린 책은 반납할 수 없어야 합니다.
        */
    await connection.beginTransaction();

    // 1. 대출 기록 확인 및 본인 확인
    const [borrowRecord] = await connection.query(
      `SELECT user_id, book_id, copy_no, return_date 
       FROM BorrowRecord WHERE record_id = ?`,
      [borrowingId]
    );

    if (borrowRecord.length === 0) {
      await connection.rollback();
      const err = new Error("Borrow record not found");
      err.status = 404;
      return next(err);
    }

    if (borrowRecord[0].user_id !== userId) {
      await connection.rollback();
      const err = new Error("You can only return your own borrowed books");
      err.status = 403;
      return next(err);
    }

    if (borrowRecord[0].return_date !== null) {
      await connection.rollback();
      const err = new Error("This book has already been returned");
      err.status = 400;
      return next(err);
    }

    // 2. 반납 처리
    await connection.query(
      `UPDATE BorrowRecord SET return_date = CURDATE() WHERE record_id = ?`,
      [borrowingId]
    );

    // 3. BookCopy 상태 업데이트
    await connection.query(
      `UPDATE BookCopy SET status = 'available' 
       WHERE book_id = ? AND copy_no = ?`,
      [borrowRecord[0].book_id, borrowRecord[0].copy_no]
    );

    await connection.commit();
    res.redirect("/borrowings");
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

const getBookInstances = async (req, res, next) => {
  const bookId = Number(req.params.id);

  try {
    /*
            TODO: 특정 동일한 책의 개별 리스트를 불러오는 코드를 작성해주세요.
        */
    const [instances] = await db.query(
      `SELECT 
        CONCAT(bc.book_id, LPAD(bc.copy_no, 2, '0')) as id,
        bc.book_id,
        br.record_id as borrowing_id,
        u.user_name as borrowed_by,
        DATE_FORMAT(br.borrow_date, '%Y.%m.%d') as borrow_date,
        bc.status
      FROM BookCopy bc
      LEFT JOIN BorrowRecord br ON bc.book_id = br.book_id 
        AND bc.copy_no = br.copy_no 
        AND br.return_date IS NULL
      LEFT JOIN User u ON br.user_id = u.user_id
      WHERE bc.book_id = ?
      ORDER BY bc.copy_no`,
      [bookId]
    );

    res.json(instances);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBooksPage,
  getAddBookPage,
  postAddBook,
  postDeleteBookInstance,
  postBorrowBook,
  postReturnBook,
  getBookInstances,
};
