import { buildPushPayload } from "@block65/webcrypto-web-push";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=UTF-8"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS
  });
}

async function loadState(env) {
  const settings = await env.DB.prepare(
    `SELECT app_name, app_icon, app_logo_url, due_date_label
     FROM app_settings
     WHERE id = 1`
  ).first();

  const usersResult = await env.DB.prepare(
    `SELECT id, name, email, avatar_url, status, role, due_date,
            notice, dismissed_due_date, teacher,
            birth_date, gender, height_cm, weight_kg,
            document_number, phone
     FROM users
     ORDER BY created_at`
  ).all();

  const teachersResult = await env.DB.prepare(
    `SELECT id, name, email, password, avatar_url, status
     FROM teachers
     ORDER BY created_at`
  ).all();

  const workoutsResult = await env.DB.prepare(
  `SELECT id, user_id, name, sort_order,
          is_archived, is_selected, archive_folder
   FROM workouts
   ORDER BY user_id, sort_order`
).all();

  const exercisesResult = await env.DB.prepare(
    `SELECT id, workout_id, custom_label, name, sets, load,
            video_url, obs, sort_order
     FROM exercises
     ORDER BY workout_id, sort_order`
  ).all();

  const workoutsByUser = {};
const workoutsMetaByUser = {};
const workoutsById = {};
const archivedWorkoutsByUser = {};

  // Organiza fichas ativas e arquivadas separadamente
for (const workout of workoutsResult.results || []) {
  const userId = workout.user_id;

  if (!workoutsByUser[userId]) {
    workoutsByUser[userId] = {};
  }

  if (!workoutsMetaByUser[userId]) {
    workoutsMetaByUser[userId] = {};
  }

  let exercises;

  if (workout.is_archived) {
    if (!archivedWorkoutsByUser[userId]) {
      archivedWorkoutsByUser[userId] = [];
    }

    const archivedWorkout = {
      id: workout.id,
      name: workout.name,
      archiveFolder: workout.archive_folder || "",
      exercises: []
    };

    archivedWorkoutsByUser[userId].push(archivedWorkout);
    exercises = archivedWorkout.exercises;
  } else {
    workoutsByUser[userId][workout.name] = [];
    exercises = workoutsByUser[userId][workout.name];

    workoutsMetaByUser[userId][workout.name] = {
      isArchived: false,
      isSelected: !!workout.is_selected,
      archiveFolder: ""
    };
  }

  workoutsById[workout.id] = {
    userId,
    exercises
  };
}

// Organiza os exercícios dentro de cada ficha
for (const exercise of exercisesResult.results || []) {
  const workout = workoutsById[exercise.workout_id];

  if (!workout) continue;

  workout.exercises.push({
    id: exercise.id,
    customLabel: exercise.custom_label || "",
    name: exercise.name || "",
    sets: exercise.sets || "",
    load: exercise.load || "",
    video: exercise.video_url || "",
    obs: exercise.obs || ""
  });
}

  const users = (usersResult.results || []).map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar_url || "",
    status: user.status,
    role: user.role || "student",
    dueDate: user.due_date || "",
    notice: user.notice || "",
    dismissedDueDate: !!user.dismissed_due_date,
    teacher: user.teacher || "",

    birthDate: user.birth_date || "",
    gender: user.gender || "",
    heightCm: user.height_cm ?? "",
    weightKg: user.weight_kg ?? "",
    documentNumber: user.document_number || "",
    phone: user.phone || "",

    workouts: workoutsByUser[user.id] || {},
workoutMeta: workoutsMetaByUser[user.id] || {},

// Inclui as fichas arquivadas de cada usuário na resposta da API.
archivedWorkouts: 
archivedWorkoutsByUser[user.id] || []
  }));

  const teachers = (teachersResult.results || []).map(teacher => ({
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    password: teacher.password,
    avatar: teacher.avatar_url || "",
    status: teacher.status || "active"
  }));

  return {
    appName: settings?.app_name || "Treinar Pro",
    appIcon: settings?.app_icon || "fa-solid fa-bolt-lightning",
    appLogoImg: settings?.app_logo_url || "",
    dueDateLabel:
      settings?.due_date_label ||
      "Data de Vencimento da Mensalidade",
    users,
    teachers,
    pending: users
      .filter(u => u.status === "pending")
      .map(u => u.email)
  };
}

async function updateStudent(env, data) {
if (!data || !data.originalEmail) {
throw new Error("E-mail original do aluno não informado.");
}

const currentUser = await env.DB.prepare(
"SELECT id, due_date FROM users WHERE email = ?"
).bind(data.originalEmail.trim().toLowerCase()).first();

if (!currentUser) {
throw new Error("Aluno não encontrado.");
}

const newDueDate = data.dueDate || "";

const dismissedDueDate =
currentUser.due_date !== newDueDate ? 0 : undefined;

const heightCm =
data.heightCm === "" || data.heightCm == null
? null
: Number(data.heightCm);

const weightKg =
data.weightKg === "" || data.weightKg == null
? null
: Number(data.weightKg);

if (
(heightCm !== null &&
(!Number.isFinite(heightCm) || heightCm <= 0)) ||
(weightKg !== null &&
(!Number.isFinite(weightKg) || weightKg <= 0))
) {
throw new Error("Altura ou peso informado é inválido.");
}

let result;

if (dismissedDueDate !== undefined) {
result = await env.DB.prepare(
"UPDATE users SET name = ?, email = ?, due_date = ?, notice = ?, teacher = ?, avatar_url = ?, birth_date = ?, gender = ?, height_cm = ?, weight_kg = ?, document_number = ?, phone = ?, dismissed_due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
).bind(
data.name || "",
data.email || "",
newDueDate,
data.notice || "",
data.teacher || "",
data.avatar || "",
data.birthDate || null,
data.gender || null,
heightCm,
weightKg,
data.documentNumber || null,
data.phone || null,
dismissedDueDate,
currentUser.id
).run();
} else {
result = await env.DB.prepare(
"UPDATE users SET name = ?, email = ?, due_date = ?, notice = ?, teacher = ?, avatar_url = ?, birth_date = ?, gender = ?, height_cm = ?, weight_kg = ?, document_number = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
).bind(
data.name || "",
data.email || "",
newDueDate,
data.notice || "",
data.teacher || "",
data.avatar || "",
data.birthDate || null,
data.gender || null,
heightCm,
weightKg,
data.documentNumber || null,
data.phone || null,
currentUser.id
).run();
}

if (!result.success) {
throw new Error("Não foi possível salvar os dados do aluno.");
}

return {
ok: true
};
}

async function updateStudentStatus(env, data) {
  if (!data || !data.email) {
    throw new Error("E-mail do aluno não informado.");
  }

  const status =
    data.status === "inactive" ? "inactive" : "approved";

  const result = await env.DB.prepare(
    `UPDATE users
     SET status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE email = ?`
  ).bind(
    status,
    data.email.trim().toLowerCase()
  ).run();

  if (!result.success) {
    throw new Error(
      "Não foi possível alterar o status do aluno."
    );
  }

  return { ok: true };
}

async function dismissStudentDueDate(env, data) {
  if (!data || !data.email) {
    throw new Error("E-mail do usuário não informado.");
  }

  const result = await env.DB.prepare(
    `UPDATE users
     SET dismissed_due_date = 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE email = ?`
  ).bind(
    data.email.trim().toLowerCase()
  ).run();

  if (!result.success) {
    throw new Error(
      "Não foi possível dispensar o aviso de vencimento."
    );
  }

  return { ok: true };
}

async function updateProfile(env, data) {
  if (!data || !data.email) {
    throw new Error("E-mail do usuário não informado.");
  }

  const email = data.email.trim().toLowerCase();

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (user) {
    const updates = [
      "name = ?",
      "avatar_url = ?"
    ];

    const values = [
      data.name || "",
      data.avatar || ""
    ];

    const fields = [
      ["birthDate", "birth_date"],
      ["gender", "gender"],
      ["heightCm", "height_cm"],
      ["weightKg", "weight_kg"],
      ["documentNumber", "document_number"],
      ["phone", "phone"]
    ];

    for (const [property, column] of fields) {
      if (Object.prototype.hasOwnProperty.call(data, property)) {
        updates.push(`${column} = ?`);

        let value = data[property];

        if (property === "heightCm" || property === "weightKg") {
          if (value === "" || value === null || value === undefined) {
            value = null;
          } else {
            value = Number(value);

            if (!Number.isFinite(value) || value <= 0) {
              throw new Error(
                "Altura ou peso informado é inválido."
              );
            }
          }
        } else if (value === "" || value === undefined) {
          value = null;
        }

        values.push(value);
      }
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(user.id);

    const result = await env.DB.prepare(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = ?`
    ).bind(...values).run();

    if (!result.success) {
      throw new Error("Não foi possível atualizar o perfil.");
    }

    return {
      ok: true
    };
  }

  const teacher = await env.DB.prepare(
    `SELECT id FROM teachers WHERE email = ?`
  ).bind(email).first();

  if (teacher) {
    const result = await env.DB.prepare(
      `UPDATE teachers
       SET name = ?,
           avatar_url = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      data.name || "",
      data.avatar || "",
      teacher.id
    ).run();

    if (!result.success) {
      throw new Error("Não foi possível atualizar o perfil.");
    }

    return {
      ok: true
    };
  }

  throw new Error("Usuário não encontrado.");
}

async function updateAppSettings(env, data) {
  if (!data) {
    throw new Error("Dados das configurações não informados.");
  }

  const result = await env.DB.prepare(
    `UPDATE app_settings
     SET app_name = ?,
         app_icon = ?,
         app_logo_url = ?,
         due_date_label = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  ).bind(
    data.appName || "Treinar Pro",
    data.appIcon || "fa-solid fa-bolt-lightning",
    data.appLogoImg || "",
    data.dueDateLabel || "Data de Vencimento da Mensalidade"
  ).run();

  if (!result.success) {
    throw new Error(
      "Não foi possível salvar as configurações."
    );
  }

  return {
    ok: true
  };
}

async function approveStudent(env, email) {
  if (!email) {
    throw new Error("E-mail do aluno não informado.");
  }

  const result = await env.DB.prepare(
    `UPDATE users
     SET status = 'approved',
         updated_at = CURRENT_TIMESTAMP
     WHERE email = ?`
  ).bind(email).run();

  if (!result.success) {
    throw new Error("Não foi possível aprovar o aluno.");
  }

  return { ok: true };
}

async function rejectStudent(env, email) {
  if (!email) {
    throw new Error("E-mail do aluno não informado.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (!user) {
    throw new Error("Aluno não encontrado.");
  }

  await env.DB.prepare(
    `DELETE FROM exercises
     WHERE workout_id IN (
       SELECT id FROM workouts WHERE user_id = ?
     )`
  ).bind(user.id).run();

  await env.DB.prepare(
    `DELETE FROM workouts WHERE user_id = ?`
  ).bind(user.id).run();

  const result = await env.DB.prepare(
    `DELETE FROM users WHERE id = ?`
  ).bind(user.id).run();

  if (!result.success) {
    throw new Error("Não foi possível recusar o aluno.");
  }

  return { ok: true };
}

async function createStudentRequest(env, data) {
  if (!data || !data.email) {
    throw new Error("E-mail do aluno não informado.");
  }

  const email = data.email.trim().toLowerCase();

  const existingUser = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (existingUser) {
    throw new Error("Este aluno já possui cadastro ou solicitação.");
  }

  const userId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users
    (id, name, email, avatar_url, status, role, due_date,
     notice, dismissed_due_date, teacher)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId,
    data.name || email.split("@")[0],
    email,
    data.avatar || "",
    "pending",
    "student",
    "",
    "",
    0,
    ""
  ).run();

  return {
    ok: true,
    userId: userId
  };
}

async function createAdmin(env, data) {
  if (!data || !data.email) {
    throw new Error("E-mail do administrador não informado.");
  }

  const email = data.email.trim().toLowerCase();

  const existingUser = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (existingUser) {
    throw new Error("Administrador já cadastrado.");
  }

  const userId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users
    (id, name, email, avatar_url, status, role, due_date,
     notice, dismissed_due_date, teacher)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId,
    data.name || email.split("@")[0],
    email,
    data.avatar || "",
    "approved",
    "admin",
    "",
    "",
    0,
    ""
  ).run();

  return {
    ok: true,
    userId: userId
  };
}

async function createStudent(env, data) {
  if (!data || !data.name || !data.email) {
    throw new Error("Nome e e-mail do aluno são obrigatórios.");
  }

  const email = data.email.trim().toLowerCase();

  const existingUser = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (existingUser) {
    throw new Error("Já existe um aluno com este e-mail.");
  }

  const userId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users
    (id, name, email, avatar_url, status, role, due_date,
     notice, dismissed_due_date, teacher)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId,
    data.name.trim(),
    email,
    data.avatar || "",
    "approved",
    "student",
    "",
    "",
    0,
    ""
  ).run();

  const workoutId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO workouts
    (id, user_id, name, sort_order)
    VALUES (?, ?, ?, ?)`
  ).bind(
    workoutId,
    userId,
    "Treino A",
    0
  ).run();

  const exerciseId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO exercises
    (id, workout_id, custom_label, name, sets, load,
     video_url, obs, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    exerciseId,
    workoutId,
    "",
    "Exercício 1",
    "3x12",
    "10 Kg",
    "",
    "",
    0
  ).run();

  return {
    ok: true,
    userId: userId,
    workoutId: workoutId,
    exerciseId: exerciseId
  };
}

async function deleteStudent(env, email) {
  if (!email) {
    throw new Error("E-mail do aluno não informado.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (!user) {
    throw new Error("Aluno não encontrado.");
  }

  const workouts = await env.DB.prepare(
    `SELECT id FROM workouts WHERE user_id = ?`
  ).bind(user.id).all();

  for (const workout of workouts.results || []) {
    await env.DB.prepare(
      `DELETE FROM exercises WHERE workout_id = ?`
    ).bind(workout.id).run();
  }

  await env.DB.prepare(
    `DELETE FROM workouts WHERE user_id = ?`
  ).bind(user.id).run();

  const result = await env.DB.prepare(
    `DELETE FROM users WHERE id = ?`
  ).bind(user.id).run();

  if (!result.success) {
    throw new Error("Não foi possível excluir o aluno.");
  }

  return {
    ok: true
  };
}

async function createTeacher(env, data) {
  if (!data || !data.name || !data.email || !data.password) {
    throw new Error("Nome, e-mail e senha são obrigatórios.");
  }

  const email = data.email.trim().toLowerCase();

  const existingTeacher = await env.DB.prepare(
    `SELECT id FROM teachers WHERE email = ?`
  ).bind(email).first();

  if (existingTeacher) {
    throw new Error("Já existe um professor cadastrado com este e-mail.");
  }

  const teacherId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO teachers
    (id, name, email, password, avatar_url, status)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    teacherId,
    data.name.trim(),
    email,
    data.password,
    data.avatar || "",
    "active"
  ).run();

  return {
    ok: true,
    id: teacherId
  };
}

async function updateTeacher(env, data) {
  if (!data || !data.id) {
    throw new Error("ID do professor não informado.");
  }

  if (!data.name || !data.email || !data.password) {
    throw new Error("Nome, e-mail e senha são obrigatórios.");
  }

  const email = data.email.trim().toLowerCase();

  const existingTeacher = await env.DB.prepare(
    `SELECT id FROM teachers
     WHERE email = ? AND id != ?`
  ).bind(email, data.id).first();

  if (existingTeacher) {
    throw new Error("Já existe outro professor cadastrado com este e-mail.");
  }

  const result = await env.DB.prepare(
    `UPDATE teachers
     SET name = ?,
         email = ?,
         password = ?,
         avatar_url = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    data.name.trim(),
    email,
    data.password,
    data.avatar || "",
    data.id
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível atualizar o professor.");
  }

  return {
    ok: true
  };
}

async function updateTeacherStatus(env, data) {
  if (!data || !data.id) {
    throw new Error("ID do professor não informado.");
  }

  const status =
    data.status === "inactive" ? "inactive" : "active";

  const result = await env.DB.prepare(
    `UPDATE teachers
     SET status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    status,
    data.id
  ).run();

  if (!result.success) {
    throw new Error(
      "Não foi possível alterar o status do professor."
    );
  }

  return { ok: true };
}

async function deleteTeacher(env, teacherId) {
  if (!teacherId) {
    throw new Error("ID do professor não informado.");
  }

  const result = await env.DB.prepare(
    `DELETE FROM teachers WHERE id = ?`
  ).bind(teacherId).run();

  if (!result.success) {
    throw new Error("Não foi possível excluir o professor.");
  }

  return {
    ok: true
  };
}

async function saveState(env, state) {
  const users = Array.isArray(state.users) ? state.users : [];
  const teachers = Array.isArray(state.teachers) ? state.teachers : [];

  const statements = [];

  statements.push(
    env.DB.prepare(`DELETE FROM exercises`)
  );

  statements.push(
    env.DB.prepare(`DELETE FROM workouts`)
  );

  statements.push(
    env.DB.prepare(
      `UPDATE app_settings
       SET app_name = ?,
           app_icon = ?,
           app_logo_url = ?,
           due_date_label = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`
    ).bind(
      state.appName || "Treinar Pro",
      state.appIcon || "fa-solid fa-bolt-lightning",
      state.appLogoImg || "",
      state.dueDateLabel || "Data de Vencimento da Mensalidade"
    )
  );

  for (const teacher of teachers) {
    const existing = await env.DB.prepare(
      `SELECT id FROM teachers
       WHERE lower(email) = lower(?)`
    ).bind(teacher.email || "").first();

    const teacherId = existing?.id || teacher.id || crypto.randomUUID();

    statements.push(
      env.DB.prepare(
        `INSERT INTO teachers
        (id, name, email, password, avatar_url, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          password = excluded.password,
          avatar_url = excluded.avatar_url,
          status = excluded.status`
      ).bind(
        teacherId,
        teacher.name || "",
        teacher.email || "",
        teacher.password || "",
        teacher.avatar || "",
        teacher.status || "active"
      )
    );
  }

  for (const user of users) {
    const existing = await env.DB.prepare(
      `SELECT id FROM users
       WHERE lower(email) = lower(?)`
    ).bind(user.email || "").first();

    const userId = existing?.id || user.id || crypto.randomUUID();

    const role =
      (user.email || "").toLowerCase() === "carlosaacre@gmail.com"
        ? "admin"
        : (user.role || "student");

    statements.push(
      env.DB.prepare(
        `INSERT INTO users
        (id, name, email, avatar_url, status, role, due_date,
         notice, dismissed_due_date, teacher,
         birth_date, gender, height_cm, weight_kg,
         document_number, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          avatar_url = excluded.avatar_url,
          status = excluded.status,
          role = excluded.role,
          due_date = excluded.due_date,
          notice = excluded.notice,
          dismissed_due_date = excluded.dismissed_due_date,
          teacher = excluded.teacher,
          birth_date = excluded.birth_date,
          gender = excluded.gender,
          height_cm = excluded.height_cm,
          weight_kg = excluded.weight_kg,
          document_number = excluded.document_number,
          phone = excluded.phone`
      ).bind(
        userId,
        user.name || "",
        user.email || "",
        user.avatar || "",
        user.status || "pending",
        role,
        user.dueDate || "",
        user.notice || "",
        user.dismissedDueDate ? 1 : 0,
        user.teacher || "",
        user.birthDate || null,
        user.gender || null,
        user.heightCm === "" || user.heightCm == null ? null : Number(user.heightCm),
        user.weightKg === "" || user.weightKg == null ? null : Number(user.weightKg),
        user.documentNumber || null,
        user.phone || null
      )
    );

    let workoutOrder = 0;
    const workoutsToSave = [];

    for (const [workoutName, exercises] of Object.entries(user.workouts || {})) {
      const meta = user.workoutMeta?.[workoutName] || {};

      workoutsToSave.push({
        name: workoutName,
        exercises,
        isArchived: !!meta.isArchived,
        isSelected: !!meta.isSelected,
        archiveFolder: meta.archiveFolder || ""
      });
    }

    for (const archived of (user.archivedWorkouts || [])) {
      workoutsToSave.push({
        name: archived.name,
        exercises: archived.exercises || [],
        isArchived: true,
        isSelected: false,
        archiveFolder: archived.archiveFolder || ""
      });
    }

    for (const workout of workoutsToSave) {
      const workoutId = crypto.randomUUID();

      statements.push(
        env.DB.prepare(
          `INSERT INTO workouts
          (id, user_id, name, sort_order, is_archived, is_selected, archive_folder)
          VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          workoutId,
          userId,
          workout.name,
          workoutOrder++,
          workout.isArchived ? 1 : 0,
          workout.isSelected ? 1 : 0,
          workout.archiveFolder || null
        )
      );

      let exerciseOrder = 0;

      for (const exercise of Array.isArray(workout.exercises) ? workout.exercises : []) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO exercises
            (id, workout_id, custom_label, name, sets, load,
             video_url, obs, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            workoutId,
            exercise.customLabel || "",
            exercise.name || "",
            exercise.sets || "",
            exercise.load || "",
            exercise.video || "",
            exercise.obs || "",
            exerciseOrder++
          )
        );
      }
    }
  }

  await env.DB.batch(statements);

  return {
    ok: true,
    state: await loadState(env)
  };
}

async function saveExercise(env, exercise) {
  if (!exercise || !exercise.id) {
    throw new Error("ID do exercício não informado.");
  }

  const result = await env.DB.prepare(
    `UPDATE exercises
     SET custom_label = ?,
         name = ?,
         sets = ?,
         load = ?,
         video_url = ?,
         obs = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    exercise.customLabel || "",
    exercise.name || "",
    exercise.sets || "",
    exercise.load || "",
    exercise.video || "",
    exercise.obs || "",
    exercise.id
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível salvar o exercício.");
  }

  return {
    ok: true
  };
  }

async function saveWorkoutLog(env, data) {
  if (!data || !data.email || !data.workoutName || !data.trainingDate) {
    throw new Error("Dados do treino não informados.");
  }

  const email = data.email.trim().toLowerCase();
  const workoutName = data.workoutName.trim();
  const trainingDate = data.trainingDate.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trainingDate)) {
    throw new Error("Data do treino inválida.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const workout = await env.DB.prepare(
    `SELECT id FROM workouts
     WHERE user_id = ? AND name = ?`
  ).bind(user.id, workoutName).first();

  if (!workout) {
    throw new Error("Ficha de treino não encontrada.");
  }

  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO workout_logs
     (id, user_id, workout_name, training_date)
     VALUES (?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    user.id,
    workoutName,
    trainingDate
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível registrar o treino.");
  }

  return { ok: true };
}

async function deleteWorkoutLog(env, data) {
  if (!data || !data.email || !data.workoutName || !data.trainingDate) {
    throw new Error("Dados do treino não informados.");
  }

  const email = data.email.trim().toLowerCase();

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const result = await env.DB.prepare(
    `DELETE FROM workout_logs
     WHERE user_id = ?
       AND workout_name = ?
       AND training_date = ?`
  ).bind(
    user.id,
    data.workoutName.trim(),
    data.trainingDate.trim()
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível desmarcar o treino.");
  }

  return { ok: true };
}

async function loadWorkoutLogs(env, email, startDate, endDate) {
  if (!email) {
    throw new Error("E-mail do usuário não informado.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email.trim().toLowerCase()).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  let query = `
    SELECT workout_name, training_date
    FROM workout_logs
    WHERE user_id = ?
  `;

  const values = [user.id];

  if (startDate) {
    query += ` AND training_date >= ?`;
    values.push(startDate);
  }

  if (endDate) {
    query += ` AND training_date <= ?`;
    values.push(endDate);
  }

  query += ` ORDER BY training_date DESC, workout_name ASC`;

  const result = await env.DB.prepare(query)
    .bind(...values)
    .all();

  return {
    ok: true,
    activities: (result.results || []).map(item => ({
      workoutName: item.workout_name,
      trainingDate: item.training_date
    }))
  };
}


  async function createRunningActivity(env, data) {
  if (!data || !data.email || !data.activity) {
    throw new Error("Dados da corrida não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email.trim().toLowerCase()).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const activity = data.activity;

  const activityId =
    activity.id || crypto.randomUUID();

  const result = await env.DB.prepare(
    `INSERT INTO running_activities
    (
      id,
      user_id,
      date,
      duration_seconds,
      distance_km,
      distance_meters,
      pace_seconds_per_km,
      average_speed_kmh,
      gps_points
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    activityId,
    user.id,
    activity.date || new Date().toISOString(),
    Number(activity.durationSeconds) || 0,
    Number(activity.distanceKm) || 0,
    Number(activity.distanceMeters) || 0,
    Number(activity.paceSecondsPerKm) || 0,
    Number(activity.averageSpeedKmh) || 0,
    JSON.stringify(activity.gpsPoints || [])
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível salvar a corrida.");
  }

  return {
    ok: true,
    id: activityId
  };
}

async function loadRunningActivities(env, email) {
  if (!email) {
    throw new Error("E-mail do usuário não informado.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email.trim().toLowerCase()).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const result = await env.DB.prepare(
    `SELECT
       id,
       date,
       duration_seconds,
       distance_km,
       distance_meters,
       pace_seconds_per_km,
       average_speed_kmh,
       gps_points
     FROM running_activities
     WHERE user_id = ?
     ORDER BY date DESC`
  ).bind(user.id).all();

  const activities = (result.results || []).map(activity => ({
    id: activity.id,
    date: activity.date,
    durationSeconds: activity.duration_seconds || 0,
    distanceKm: Number(activity.distance_km) || 0,
    distanceMeters: activity.distance_meters || 0,
    paceSecondsPerKm: activity.pace_seconds_per_km || 0,
    averageSpeedKmh: Number(activity.average_speed_kmh) || 0,
    gpsPoints: JSON.parse(activity.gps_points || "[]")
  }));

  return {
    ok: true,
    activities
  };
}

async function deleteRunningActivity(env, data) {
  if (!data || !data.email || !data.activityId) {
    throw new Error("Dados da corrida não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email.trim().toLowerCase()).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const result = await env.DB.prepare(
    `DELETE FROM running_activities
     WHERE id = ?
     AND user_id = ?`
  ).bind(
    data.activityId,
    user.id
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível excluir a corrida.");
  }

  return {
    ok: true
  };
}

  async function createExercise(env, data) {
  if (!data || !data.email || !data.workoutName || !data.exercise) {
    throw new Error("Dados do exercício não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email).first();

  if (!user) {
    throw new Error("Aluno não encontrado.");
  }

  const workout = await env.DB.prepare(
    `SELECT id FROM workouts
     WHERE user_id = ? AND name = ?`
  ).bind(user.id, data.workoutName).first();

  if (!workout) {
    throw new Error("Ficha não encontrada.");
  }

  const exerciseId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO exercises
    (id, workout_id, custom_label, name, sets, load, video_url, obs, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    exerciseId,
    workout.id,
    data.exercise.customLabel || "",
    data.exercise.name || "",
    data.exercise.sets || "",
    data.exercise.load || "",
    data.exercise.video || "",
    data.exercise.obs || "",
    data.exercise.sort_order || 0
  ).run();

  return {
    ok: true,
    id: exerciseId
  };
}

async function deleteExercise(env, exerciseId) {
  if (!exerciseId) {
    throw new Error("ID do exercício não informado.");
  }

  const result = await env.DB.prepare(
    `DELETE FROM exercises WHERE id = ?`
  ).bind(exerciseId).run();

  if (!result.success) {
    throw new Error("Não foi possível excluir o exercício.");
  }

  return {
    ok: true
  };
}

async function createWorkout(env, data) {
  if (!data || !data.email || !data.workoutName) {
    throw new Error("Dados da ficha não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email).first();

  if (!user) {
    throw new Error("Aluno não encontrado.");
  }

  const workoutId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO workouts
    (id, user_id, name, sort_order)
    VALUES (?, ?, ?, ?)`
  ).bind(
    workoutId,
    user.id,
    data.workoutName,
    data.sort_order || 0
  ).run();

  return {
    ok: true,
    id: workoutId
  };
}

async function renameWorkout(env, data) {
  if (!data || !data.email || !data.oldName || !data.newName) {
    throw new Error("Dados da ficha não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email).first();

  if (!user) {
    throw new Error("Aluno não encontrado.");
  }

  const result = await env.DB.prepare(
    `UPDATE workouts
     SET name = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND name = ?`
  ).bind(
    data.newName,
    user.id,
    data.oldName
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível renomear a ficha.");
  }

  return {
    ok: true
  };
}

async function deleteWorkout(env, data) {
  if (!data || !data.email || !data.workoutName) {
    throw new Error("Dados da ficha não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email).first();

  if (!user) {
    throw new Error("Aluno não encontrado.");
  }

  const workout = await env.DB.prepare(
    `SELECT id FROM workouts
     WHERE user_id = ? AND name = ?`
  ).bind(user.id, data.workoutName).first();

  if (!workout) {
    throw new Error("Ficha não encontrada.");
  }

  await env.DB.prepare(
    `DELETE FROM exercises WHERE workout_id = ?`
  ).bind(workout.id).run();

  // Exclui o histórico somente da ficha excluída definitivamente
  await env.DB.prepare(
    `DELETE FROM workout_logs
     WHERE user_id = ? AND workout_name = ?`
  ).bind(user.id, data.workoutName).run();

  const result = await env.DB.prepare(
    `DELETE FROM workouts WHERE id = ?`
  ).bind(workout.id).run();

  if (!result.success) {
    throw new Error("Não foi possível excluir a ficha.");
  }

  return {
    ok: true
  };
}

async function archiveWorkout(env, data) {
  if (!data?.email || !data?.workoutName || !data?.archiveFolder) {
    throw new Error("Dados para arquivar a ficha não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const workout = await env.DB.prepare(
    `SELECT id FROM workouts
     WHERE user_id = ? AND name = ? AND is_archived = 0`
  ).bind(user.id, data.workoutName).first();

  if (!workout) {
    throw new Error("Ficha não encontrada.");
  }

  const result = await env.DB.prepare(
    `UPDATE workouts
     SET is_archived = 1,
         is_selected = 0,
         archive_folder = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(
    data.archiveFolder,
    workout.id,
    user.id
  ).run();

  if (!result.success) {
    throw new Error("Não foi possível arquivar a ficha.");
  }

  return {
  ok: true,
  id: workout.id
};
}

async function restoreWorkout(env, data) {
  if (!data?.email || !data?.workoutId) {
    throw new Error("Dados para restaurar a ficha não informados.");
  }

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(data.email).first();

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const workout = await env.DB.prepare(
    `SELECT id FROM workouts
     WHERE id = ? AND user_id = ? AND is_archived = 1`
  ).bind(data.workoutId, user.id).first();

  if (!workout) {
    throw new Error("Ficha arquivada não encontrada.");
  }

  await env.DB.prepare(
    `UPDATE workouts
     SET is_selected = 0
     WHERE user_id = ? AND is_archived = 0`
  ).bind(user.id).run();

  const result = await env.DB.prepare(
    `UPDATE workouts
     SET is_archived = 0,
         is_selected = 1,
         archive_folder = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(workout.id, user.id).run();

  if (!result.success) {
    throw new Error("Não foi possível restaurar a ficha.");
  }

  return { ok: true };
}


async function savePhysicalAssessment(env, data) {
  const email = String(data.student_email || "")
    .trim()
    .toLowerCase();

  const date = String(data.assessment_date || "").trim();
  const assessmentName = String(data.assessment_name || "").trim();

  if (!email || !date) {
    return {
      ok: false,
      error: "Aluno e data da avaliação são obrigatórios"
    };
  }

  const id = crypto.randomUUID();
  const values = data.values || {};

  await env.DB.prepare(`
    INSERT INTO physical_assessments
      (id, student_email, assessment_date, assessment_name,
       evaluator_email, evaluator_name, protocol)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    email,
    date,
    assessmentName || null,
    data.evaluator_email || null,
    data.evaluator_name || null,
    data.protocol || null
  ).run();

  for (const [fieldKey, value] of Object.entries(values)) {
    const field = await env.DB.prepare(`
      SELECT id
      FROM physical_assessment_fields
      WHERE field_key = ? AND is_active = 1
    `).bind(fieldKey).first();

    if (!field) continue;

    await env.DB.prepare(`
      INSERT INTO physical_assessment_values
        (id, assessment_id, field_id, field_value)
      VALUES (?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      id,
      field.id,
      value == null ? null : String(value)
    ).run();
  }

  return { ok: true, id };
}

async function updatePhysicalAssessment(env, data) {
  const id = String(data.id || "").trim();

  if (!id) {
    return {
      ok: false,
      error: "ID da avaliação obrigatório"
    };
  }

  const existing = await env.DB.prepare(`
    SELECT id
    FROM physical_assessments
    WHERE id = ?
  `).bind(id).first();

  if (!existing) {
    return {
      ok: false,
      error: "Avaliação não encontrada"
    };
  }

  const values = data.values || {};
  const assessmentName = String(data.assessment_name || "").trim();

  await env.DB.prepare(`
    UPDATE physical_assessments
    SET assessment_date = ?,
        assessment_name = ?,
        evaluator_email = ?,
        evaluator_name = ?,
        protocol = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    data.assessment_date,
    assessmentName || null,
    data.evaluator_email || null,
    data.evaluator_name || null,
    data.protocol || null,
    id
  ).run();

  for (const [fieldKey, value] of Object.entries(values)) {
    const field = await env.DB.prepare(`
      SELECT id
      FROM physical_assessment_fields
      WHERE field_key = ? AND is_active = 1
    `).bind(fieldKey).first();

    if (!field) continue;

    await env.DB.prepare(`
      INSERT INTO physical_assessment_values
        (id, assessment_id, field_id, field_value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (assessment_id, field_id)
      DO UPDATE SET field_value = excluded.field_value
    `).bind(
      crypto.randomUUID(),
      id,
      field.id,
      value == null ? null : String(value)
    ).run();
  }

  return { ok: true, id };
}

// ==========================================
// PLANO ALIMENTAR
// ==========================================

async function checkMealPlanAccess(
  env,
  actorEmail,
  studentEmail,
  manage = false
) {
  actorEmail = (actorEmail || "").trim().toLowerCase();
  studentEmail = (studentEmail || "").trim().toLowerCase();

  if (!actorEmail || !studentEmail) return false;

  // Administrador
  if (actorEmail === "carlosaacre@gmail.com") {
    return true;
  }

  // Professor
  const teacher = await env.DB.prepare(`
    SELECT name
    FROM teachers
    WHERE lower(email) = ?
      AND (status = 'active' OR status IS NULL)
  `).bind(actorEmail).first();

  if (teacher) {
    const student = await env.DB.prepare(`
      SELECT teacher
      FROM users
      WHERE lower(email) = ?
    `).bind(studentEmail).first();

    if (!student) return false;

    const assignedTeacher = (student.teacher || "")
      .trim()
      .toLowerCase();

    return (
      assignedTeacher === (teacher.name || "").trim().toLowerCase() ||
      assignedTeacher === actorEmail
    );
  }

  // Aluno: somente consulta o próprio plano
  return !manage && actorEmail === studentEmail;
}


async function loadMealPlan(env, studentEmail) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM meal_plans
    WHERE lower(student_email) = ?
    ORDER BY created_at ASC, rowid ASC
  `).bind(studentEmail.toLowerCase()).all();

  return {
    ok: true,
    meals: result.results || []
  };
}


async function saveMealPlan(env, data) {
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO meal_plans (
      id,
      student_email,
      created_by_email,
      day_of_week,
      meal_name,
      meal_time,
      foods,
      substitutions,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.studentEmail.trim().toLowerCase(),
    data.actorEmail.trim().toLowerCase(),
    data.dayOfWeek,
    data.mealName.trim(),
    data.mealTime || "",
    data.foods || "",
    data.substitutions || "",
    data.notes || ""
  ).run();

  return { ok: true, id };
}

async function updateMealPlan(env, data) {
  await env.DB.prepare(`
    UPDATE meal_plans
    SET
      day_of_week = ?,
      meal_name = ?,
      meal_time = ?,
      foods = ?,
      substitutions = ?,
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND lower(student_email) = ?
  `).bind(
    data.dayOfWeek,
    data.mealName.trim(),
    data.mealTime || "",
    data.foods || "",
    data.substitutions || "",
    data.notes || "",
    data.id,
    data.studentEmail.trim().toLowerCase()
  ).run();

  return { ok: true };
}


async function deleteMealPlan(env, id, studentEmail) {
  await env.DB.prepare(`
    DELETE FROM meal_plans
    WHERE id = ?
      AND lower(student_email) = ?
  `).bind(
    id,
    studentEmail.toLowerCase()
  ).run();

  return { ok: true };
}

async function getPushSubscriptions(env, studentEmail) {
  return await env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE student_email = ?"
  ).bind(studentEmail.toLowerCase()).all();
}

async function sendPushToStudent(env, studentEmail, notification) {
  const result = await getPushSubscriptions(env, studentEmail);
  const subscriptions = result.results || [];
  let sentCount = 0;

  for (const row of subscriptions) {
    try {
      const subscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      const payload = await buildPushPayload(
        {
          data: {
            title: notification.title || "Treinar Pro",
            body: notification.body || "Está na hora da sua refeição!",
            url: "./",
            tag: notification.tag || "treinar-pro-refeicao"
          }
        },
        subscription,
        {
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY
        }
      );

      const response = await fetch(row.endpoint, payload);

      if (response.ok) {
        sentCount++;
      } else if (response.status === 404 || response.status === 410) {
        await env.DB.prepare(
          "DELETE FROM push_subscriptions WHERE id = ?"
        ).bind(row.id).run();
      }
    } catch (error) {
      console.error("Erro ao enviar push:", error);
    }
  }

  return sentCount;
}

  export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    try {
      const url = new URL(request.url);

      // Chave pública para ativar notificações
if (url.pathname === "/api/push/public-key" && request.method === "GET") {
  return json({ publicKey: env.VAPID_PUBLIC_KEY });
}

// Cadastrar dispositivo para receber notificações
if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const sub = body.subscription;

  if (!email || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return json({ error: "Dados da inscrição incompletos." }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO push_subscriptions
      (id, student_email, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      student_email = excluded.student_email,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    crypto.randomUUID(),
    email,
    sub.endpoint,
    sub.keys.p256dh,
    sub.keys.auth
  ).run();

  return json({ ok: true });
}

// Enviar mensagem de teste pelo administrador
if (url.pathname === "/api/push/test" && request.method === "POST") {
  const body = await request.json();

  if (String(body.adminEmail || "").toLowerCase() !== "carlosaacre@gmail.com") {
    return json({ error: "Acesso não autorizado." }, 403);
  }

  const studentEmail = String(body.studentEmail || "").trim().toLowerCase();
  const message = String(body.message || "").trim();

  if (!studentEmail || !message) {
    return json({ error: "Informe o aluno e a mensagem." }, 400);
  }

  const sentCount = await sendPushToStudent(env, studentEmail, {
    title: "Treinar Pro",
    body: message,
    tag: "treinar-pro-teste"
  });

  if (!sentCount) {
    return json({ error: "Nenhum dispositivo cadastrado recebeu a notificação." }, 404);
  }

  return json({ ok: true, sentCount });
}

      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          api: "Treinar Pro API",
          database: "D1 conectado"
        });
      }

      if (url.pathname === "/api/test-db") {
        const result = await env.DB.prepare(
          `SELECT name
           FROM sqlite_master
           WHERE type = 'table'
           ORDER BY name`
        ).all();

        return json({
          ok: true,
          tables: result.results || []
        });
      }

      if (
  url.pathname === "/api/exercise" &&
  request.method === "PUT"
) {
  const exercise = await request.json();

  const result = await saveExercise(env, exercise);

  return json(result);
}

// ==========================================
// ROTAS DO PLANO ALIMENTAR
// ==========================================

if (
  url.pathname === "/api/meal-plan" &&
  request.method === "GET"
) {
  const studentEmail = (
    url.searchParams.get("studentEmail") || ""
  ).trim().toLowerCase();

  const actorEmail = (
    url.searchParams.get("actorEmail") || ""
  ).trim().toLowerCase();

  const allowed = await checkMealPlanAccess(
    env,
    actorEmail,
    studentEmail,
    false
  );

  if (!allowed) {
    return json({
      ok: false,
      error: "Acesso não autorizado."
    }, 403);
  }

  const result = await loadMealPlan(env, studentEmail);
  return json(result);
}

if (
  url.pathname === "/api/meal-plan" &&
  request.method === "POST"
) {
  const data = await request.json();

  const allowed = await checkMealPlanAccess(
    env,
    data.actorEmail,
    data.studentEmail,
    true
  );

  if (!allowed) {
    return json({
      ok: false,
      error: "Você não tem permissão para cadastrar refeições."
    }, 403);
  }

  if (
    !data.dayOfWeek ||
    !data.mealName ||
    !data.studentEmail ||
    !data.actorEmail
  ) {
    return json({
      ok: false,
      error: "Preencha os dados obrigatórios."
    }, 400);
  }

  const result = await saveMealPlan(env, data);
  return json(result);
}

if (
  url.pathname === "/api/meal-plan" &&
  request.method === "POST"
) {
  const data = await request.json();

  const allowed = await checkMealPlanAccess(
    env,
    data.actorEmail,
    data.studentEmail,
    true
  );

  if (!allowed) {
    return json({
      ok: false,
      error: "Você não tem permissão para cadastrar refeições."
    }, 403);
  }

  if (
    !data.dayOfWeek ||
    !data.mealName ||
    !data.studentEmail ||
    !data.actorEmail
  ) {
    return json({
      ok: false,
      error: "Preencha os dados obrigatórios."
    }, 400);
  }

  const result = await saveMealPlan(env, data);
  return json(result);
}

if (
  url.pathname === "/api/meal-plan" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const allowed = await checkMealPlanAccess(
    env,
    data.actorEmail,
    data.studentEmail,
    true
  );

  if (!allowed) {
    return json({
      ok: false,
      error: "Você não tem permissão para editar refeições."
    }, 403);
  }

  if (
    !data.id ||
    !data.dayOfWeek ||
    !data.mealName ||
    !data.studentEmail ||
    !data.actorEmail
  ) {
    return json({
      ok: false,
      error: "Preencha os dados obrigatórios."
    }, 400);
  }

  const result = await updateMealPlan(env, data);
  return json(result);
}

if (
  url.pathname === "/api/meal-plan" &&
  request.method === "DELETE"
) {
  const id = url.searchParams.get("id");
  const studentEmail = url.searchParams.get("studentEmail");
  const actorEmail = url.searchParams.get("actorEmail");

  const allowed = await checkMealPlanAccess(
    env,
    actorEmail,
    studentEmail,
    true
  );

  if (!allowed) {
    return json({
      ok: false,
      error: "Você não tem permissão para excluir refeições."
    }, 403);
  }

  if (!id) {
    return json({
      ok: false,
      error: "ID da refeição não informado."
    }, 400);
  }

  const result = await deleteMealPlan(
    env,
    id,
    studentEmail
  );

  return json(result);
}

if (
  url.pathname === "/api/workout-log" &&
  request.method === "POST"
) {
  const data = await request.json();
  const result = await saveWorkoutLog(env, data);
  return json(result);
}

if (
  url.pathname === "/api/workout-log" &&
  request.method === "DELETE"
) {
  const data = await request.json();
  const result = await deleteWorkoutLog(env, data);
  return json(result);
}

if (
  url.pathname === "/api/workout-log" &&
  request.method === "GET"
) {
  const email = url.searchParams.get("email");
  const startDate = url.searchParams.get("start");
  const endDate = url.searchParams.get("end");

  const result = await loadWorkoutLogs(
    env,
    email,
    startDate,
    endDate
  );

  return json(result);
}


if (
  url.pathname === "/api/running" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await createRunningActivity(env, data);

  return json(result);
}

if (
  url.pathname === "/api/running" &&
  request.method === "GET"
) {
  const email = url.searchParams.get("email");

  const result = await loadRunningActivities(env, email);

  return json(result);
}

if (
  url.pathname === "/api/running" &&
  request.method === "DELETE"
) {
  const data = await request.json();

  const result = await deleteRunningActivity(env, data);

  return json(result);
}

      if (
  url.pathname === "/api/exercise" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await createExercise(env, data);

  return json(result);
}

      if (
  url.pathname === "/api/exercise" &&
  request.method === "DELETE"
) {
  const exerciseId = url.searchParams.get("id");

  const result = await deleteExercise(env, exerciseId);

  return json(result);
}
      
if (
  url.pathname === "/api/workout" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await createWorkout(env, data);

  return json(result);
}

      if (
  url.pathname === "/api/workout" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await renameWorkout(env, data);

  return json(result);
}

if (
  url.pathname === "/api/workout" &&
  request.method === "DELETE"
) {
  const data = await request.json();

  const result = await deleteWorkout(env, data);

  return json(result);
}

if (
  url.pathname === "/api/workout/archive" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await archiveWorkout(env, data);

  return json(result);
}

if (
  url.pathname === "/api/workout/restore" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await restoreWorkout(env, data);

  return json(result);
}


      if (
        url.pathname === "/api/state" &&
        request.method === "GET"
      ) {
        const state = await loadState(env);

        return json({
          ok: true,
          state
        });
      }

      if (
  url.pathname === "/api/student" &&
  request.method === "PUT"
) {
  const data = await request.json();
  const result = await updateStudent(env, data);
  return json(result);
} 

if (
  url.pathname === "/api/student/status" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await updateStudentStatus(env, data);

  return json(result);
}

if (
  url.pathname === "/api/student/dismiss-due-date" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await dismissStudentDueDate(env, data);

  return json(result);
}

if (
  url.pathname === "/api/student" &&
  request.method === "POST"
) {
  const data = await request.json();
  const result = await createStudent(env, data);
  return json(result);
}

if (
  url.pathname === "/api/admin" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await createAdmin(env, data);

  return json(result);
}

if (
  url.pathname === "/api/student/request" &&
  request.method === "POST"
) {
  const data = await request.json();

  const result = await createStudentRequest(env, data);

  return json(result);
}

if (
  url.pathname === "/api/student" &&
  request.method === "DELETE"
) {
  const data = await request.json();
  const result = await deleteStudent(env, data.email);
  return json(result);
}

if (
  url.pathname === "/api/profile" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await updateProfile(env, data);

  return json(result);
}

if (
  url.pathname === "/api/settings" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await updateAppSettings(env, data);

  return json(result);
}

if (
  url.pathname === "/api/student/approve" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await approveStudent(env, data.email);

  return json(result);
}

if (
  url.pathname === "/api/student/reject" &&
  request.method === "DELETE"
) {
  const data = await request.json();

  const result = await rejectStudent(env, data.email);

  return json(result);
}

if (
  url.pathname === "/api/teacher" &&
  request.method === "POST"
) {
  const data = await request.json();
  const result = await createTeacher(env, data);
  return json(result);
}

if (
  url.pathname === "/api/teacher" &&
  request.method === "PUT"
) {
  const data = await request.json();
  const result = await updateTeacher(env, data);
  return json(result);
}

if (
  url.pathname === "/api/teacher/status" &&
  request.method === "PUT"
) {
  const data = await request.json();

  const result = await updateTeacherStatus(env, data);

  return json(result);
}

if (
  url.pathname === "/api/teacher" &&
  request.method === "DELETE"
) {
  const data = await request.json();
  const result = await deleteTeacher(env, data.id);
  return json(result);
}

      if (
        url.pathname === "/api/state" &&
        request.method === "PUT"
      ) {
        const state = await request.json();

        const result = await saveState(env, state);

        return json(result);
      }

// ==========================================
      // AVALIAÇÕES FÍSICAS
      // ==========================================

      if (
        url.pathname === "/api/assessment-fields" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT id, field_key, label, group_name, unit,
                 sort_order, is_active
          FROM physical_assessment_fields
          WHERE is_active = 1
          ORDER BY group_name, sort_order
        `).all();

        return json({
          ok: true,
          fields: result.results || []
        });
      }

      if (
        url.pathname === "/api/assessments" &&
        request.method === "GET"
      ) {
        const email = (
          url.searchParams.get("student_email") || ""
        ).trim().toLowerCase();

        if (!email) {
          return json({
            ok: false,
            error: "E-mail do aluno obrigatório"
          }, 400);
        }

        const result = await env.DB.prepare(`
          SELECT *
          FROM physical_assessments
          WHERE lower(student_email) = ?
          ORDER BY assessment_date DESC, created_at DESC
        `).bind(email).all();

        const assessments = [];

        for (const assessment of result.results || []) {
          const valuesResult = await env.DB.prepare(`
            SELECT f.field_key, f.label, f.group_name,
                   f.unit, v.field_value
            FROM physical_assessment_values v
            JOIN physical_assessment_fields f
              ON f.id = v.field_id
            WHERE v.assessment_id = ?
            ORDER BY f.group_name, f.sort_order
          `).bind(assessment.id).all();

          const values = {};

          for (const item of valuesResult.results || []) {
            values[item.field_key] = item.field_value;
          }

          assessments.push({
            ...assessment,
            values
          });
        }

        return json({
          ok: true,
          assessments
        });
      }

      if (
        url.pathname === "/api/assessments" &&
        request.method === "POST"
      ) {
        const data = await request.json();
        const result = await savePhysicalAssessment(env, data);

        return json(result);
      }

      if (
        url.pathname === "/api/assessments" &&
        request.method === "PUT"
      ) {
        const data = await request.json();
        const result = await updatePhysicalAssessment(env, data);

        return json(result);
      }

      if (
        url.pathname === "/api/assessments" &&
        request.method === "DELETE"
      ) {
        const id = url.searchParams.get("id");

        if (!id) {
          return json({
            ok: false,
            error: "ID da avaliação obrigatório"
          }, 400);
        }

        await env.DB.batch([
          env.DB.prepare(`
            DELETE FROM physical_assessment_values
            WHERE assessment_id = ?
          `).bind(id),
          env.DB.prepare(`
            DELETE FROM physical_assessments
            WHERE id = ?
          `).bind(id)
        ]);

        return json({ ok: true });
      }

      return json(
        {
          ok: false,
          error: "Rota não encontrada"
        },
        404
      );
    } catch (error) {
      return json(
        {
          ok: false,
          error: error.message || "Erro interno"
        },
        500
      );
    }
  }
};
