import {Request, Response, response} from 'express';

import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHourToMinutes';

interface ScheduleItem {
  week_day: number;
  from: string;
  to: string;
}

export default class ClassController {
  async index(req: Request, res: Response) {
    const filters = req.query;
    if(!filters.subject || !filters.week_day || !filters.time) {
      return res.status(400).json({
        error: 'Missing filters to search classes'
      });
    }
    const timeInMinutes = convertHourToMinutes(filters.time as string);

    const classes = await db('classes')
      .whereExists(function() {
        this.select('classes_schedule.*')
          .from('classes_schedule')
          .whereRaw('`classes_schedule`.`class_id` = `classes`.`id`')
          .whereRaw('`classes_schedule`.`week_day` = ??', [Number(filters.week_day)])
          .whereRaw('`classes_schedule`.`from` <= ??', [timeInMinutes])
          .whereRaw('`classes_schedule`.`to` > ??', [timeInMinutes])
      })
      .where('classes.subject', '=', filters.subject as string)            
      .join('users', 'classes.user_id', '=', 'users.id')
      .select(['classes.*', 'users.*'])      


    return res.json(classes);

  }

  async create (req: Request, res: Response) {
    const {
      name, 
      avatar,
      whatsapp,
      bio,
      subject,
      cost,
      schedules
    } = req.body;  
  
    const trx = await db.transaction();
    try{
      const insertedUsersIds = await trx('users').insert({
        name: name,
        avatar: avatar,
        whatsapp: whatsapp,
        bio: bio,
      })
  
      const user_id = insertedUsersIds[0];
  
      const insertedClassesIds = await trx('classes').insert({
        subject: subject,
        cost: cost,
        user_id: user_id    
      })
  
      const class_id = insertedClassesIds[0];
  
      const classSchedule = schedules.map((scheduleItem: ScheduleItem) => {    
        return {
          class_id: class_id,
          week_day: scheduleItem.week_day,
          from: convertHourToMinutes(scheduleItem.from),
          to: convertHourToMinutes(scheduleItem.to),
        };
      });
  
      await trx('classes_schedule').insert(classSchedule);
  
      await trx.commit();
      
      return res.status(201).send();
    }catch(e) {
      console.log(e);
      await trx.rollback();
      return res.status(400).json({
        error: "Unexpected error while creating new class"
      });
    }
  }
}